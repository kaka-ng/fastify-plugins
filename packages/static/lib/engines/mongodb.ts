import { send, SendOptions, SendResult } from '@kakang/abstract-send'
import { EngineOptions } from '@kakang/abstract-send/lib/options'
import { IncomingMessage } from 'http'
import { GridFSBucket } from 'mongodb'
import { basename } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { Engine } from './engine'

interface MongoDBEngineOptions {
  bucket: GridFSBucket
}

export class MongoDBEngine extends Engine {
  #bucket: GridFSBucket

  constructor (options: MongoDBEngineOptions) {
    super()
    this.#bucket = options.bucket
  }

  async upload (path: string, readable: Readable): Promise<void> {
    const filename = basename(path)
    const writable = this.#bucket.openUploadStream(filename, {
      metadata: {
        // we need to replace backslash to forwardslash
        path: path.replace(/\\/g, '/'),
        filename
      }
    })
    await pipeline(readable, writable)
  }

  download (message: IncomingMessage, path: string, options?: SendOptions): Promise<SendResult> {
    const engine: EngineOptions = {
      stat: async (path: string) => {
        const documents = await this.#bucket.find({
          // we need to replace backslash to forwardslash
          'metadata.path': path.replace(/\\/g, '/'),
        }, { limit: 1, sort: { uploadDate: -1 } }).toArray()
        if (documents[0]) {
          return {
            size: documents[0].length,
            mtime: documents[0].uploadDate,
            isDirectory: () => false
          }
        }
        // we simulate the fs event
        // ENOENT as file not found
        const error: any = Error('Not Found')
        error.code = 'ENOENT'
        throw error
      },
      createReadStream: async (path, options) => {
        // we must find the record before open stream
        const documents = await this.#bucket.find({
          // we need to replace backslash to forwardslash
          'metadata.path': path.replace(/\\/g, '/'),
        }, { limit: 1, sort: { uploadDate: -1 } }).toArray()
        if (documents[0]) {
          return this.#bucket.openDownloadStream(documents[0]._id, {
            start: options.start,
            // end is the position stop before reading
            // so, unlike fs.createReadable. we need
            // one more bytes
            end: options.end + 1
          }) as Readable
        }
        return Readable.from([])
      },
    }
    return send(message, path, { ...options, engine })
  }
}
