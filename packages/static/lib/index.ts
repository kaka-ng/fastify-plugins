import { SendOptions } from '@kakang/abstract-send'
import { FastifyReply, FastifyRequest, type FastifyPluginAsync } from 'fastify'
import FastifyPlugin from 'fastify-plugin'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
import { Engine } from './engines/engine'
import { FileSystemEngine } from './engines/fs'
import { normalizeRoots, normalizeSendOption, normalizeServe } from './option'

declare module 'fastify' {
  interface FastifyStaticInstance {
    upload: (path: string, readable: Readable) => Promise<void>
  }

  interface FastifyInstance {
    static: FastifyStaticInstance
  }

  interface FastifyReply {
    sendFile: (this: FastifyReply, path: string, options?: Partial<FastifyStaticOption>) => Promise<void>
    download: (this: FastifyReply, path: string, filename: string, options?: Partial<FastifyStaticOption>) => Promise<void>
  }
}

// send options
export interface FastifyStaticOption extends Omit<SendOptions, 'root' | 'start' | 'end' | 'engine'> {
  root: string | string[]
  // engine
  engine?: Engine
  // allows to provide fallback
  handleNotFound?: (request: FastifyRequest, reply: FastifyReply) => void | Promise<void>
  // serve
  serve?: boolean | string
}

const plugin: FastifyPluginAsync<FastifyStaticOption> = async function (fastify, options) {
  const globals = {
    roots: normalizeRoots(options.root),
    engine: options.engine != null ? options.engine : new FileSystemEngine(),
    options: normalizeSendOption(options),
    handleNotFound: options.handleNotFound
  }
  const serveURL = normalizeServe(options.serve)

  fastify.decorate('static', {
    upload: async function upload (path: string, readable: Readable) {
      const filepath = resolve(globals.roots[0], path)
      await globals.engine.upload(filepath, readable)
    }
  })

  fastify.decorateReply('sendFile', async function sendFile (path: string, options?: Partial<FastifyStaticOption>) {
    const scoped = {
      roots: options?.root != null ? normalizeRoots(options.root) : globals.roots,
      engine: options?.engine != null ? options.engine : globals.engine,
      options: { ...globals.options, ...normalizeSendOption(options) },
      handleNotFound: typeof options?.handleNotFound === 'function' ? options.handleNotFound : globals.handleNotFound
    }

    for (let i = 0; i < scoped.roots.length; i++) {
      const root = scoped.roots[i]
      const { statusCode, headers, stream, type } = await scoped.engine.download(this.request.raw, path, { ...scoped.options, root })
      switch (type) {
        case 'file':
        case 'directory': {
          this.status(statusCode)
          this.headers(headers)
          await this.send(stream)
          break
        }
        case 'error': {
          if (statusCode === 404) {
            // try next root path
            if (i < scoped.roots.length - 1) continue
            // allows custom not found
            // mostly used in spa
            if (typeof scoped.handleNotFound === 'function') {
              await scoped.handleNotFound(this.request, this)
            } else {
              this.callNotFound()
            }
          } else {
            this.status(statusCode)
            this.headers(headers)
            await this.send(stream)
          }
          break
        }
      }
    }
  })

  fastify.decorateReply('download', async function download (path: string, filename: string, options?: Partial<FastifyStaticOption>) {
    const scoped = {
      roots: options?.root != null ? normalizeRoots(options.root) : globals.roots,
      engine: options?.engine != null ? options.engine : globals.engine,
      options: { ...globals.options, ...normalizeSendOption(options) },
      handleNotFound: typeof options?.handleNotFound === 'function' ? options.handleNotFound : globals.handleNotFound
    }

    for (let i = 0; i < scoped.roots.length; i++) {
      const root = scoped.roots[i]
      const { statusCode, headers, stream, type } = await scoped.engine.download(this.request.raw, path, { ...scoped.options, root })
      switch (type) {
        case 'file':
        case 'directory': {
          this.status(statusCode)
          this.headers({
            ...headers,
            'content-disposition': `attachment; filename="${encodeURIComponent(filename)}"`
          })
          await this.send(stream)
          break
        }
        case 'error': {
          if (statusCode === 404) {
            // try next root path
            if (i < scoped.roots.length - 1) continue
            // allows custom not found
            // mostly used in spa
            if (typeof scoped.handleNotFound === 'function') {
              await scoped.handleNotFound(this.request, this)
            } else {
              this.callNotFound()
            }
          } else {
            this.status(statusCode)
            this.headers(headers)
            await this.send(stream)
          }
          break
        }
      }
    }
  })

  if (typeof serveURL === 'string') {
    fastify.route({
      url: serveURL + '*',
      method: ['GET', 'HEAD'],
      handler: (request, reply) => {
        const index = request.url.indexOf(serveURL)
        return reply.sendFile(request.url.slice(index + serveURL.length))
      }
    })
  }
}

export const FastifyStatic = FastifyPlugin(plugin, {
  fastify: '5.x',
  name: '@kakang/fastify-static',
  decorators: {
    fastify: [],
    request: [],
    reply: [],
  },
  dependencies: [],
  encapsulate: false,
})

export { Engine } from './engines/engine'
export { FileSystemEngine } from './engines/fs'
export { MongoDBEngine } from './engines/mongodb'
