import { parseExpression } from 'cron-parser'
import {
  JoSk,
  MongoAdapter as JoSkMongoAdapter,
  MongoAdapterOptions as JoSkMongoAdapterOptions,
  RedisAdapter
} from 'josk'
import { Collection } from 'mongodb'

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/try#using_promise.try
const promiseTry = function (func: Function) {
  return new Promise((resolve, reject) => {
    try {
      resolve(func())
    } catch (err) {
      reject(err)
    }
  })
}

const ensureIndex = async (collection: Collection, keys: any, opts: any) => {
  try {
    await collection.createIndex(keys, opts)
  } catch (e: any) {
    if (e.code === 85) {
      let indexName
      const indexes = await collection.indexes()
      for (const index of indexes) {
        let drop = true
        for (const indexKey of Object.keys(keys)) {
          if (typeof index.key[indexKey] === 'undefined') {
            drop = false
            break
          }
        }

        for (const indexKey of Object.keys(index.key)) {
          if (typeof keys[indexKey] === 'undefined') {
            drop = false
            break
          }
        }

        if (drop) {
          indexName = index.name
          break
        }
      }

      if (indexName) {
        await collection.dropIndex(indexName)
        await collection.createIndex(keys, opts)
      }
    } else {
      console.info(`[INFO] [josk] [MongoAdapter] [ensureIndex] Can not set ${Object.keys(keys).join(' + ')} index on "${collection.collectionName}" collection`, { keys, opts, details: e })
    }
  }
}

export class CronJob extends JoSk {
  async setCronJob (func: () => void | Promise<void>, cron: string, uid: string): Promise<string> {
    const nextTimestamp = +parseExpression(cron).next().toDate()
    const that = this
    return await this.setInterval(function (ready) {
      ready(parseExpression(cron).next().toDate())
      // since we are cron
      // we should not throw when there is error
      promiseTry(func).catch((error) => {
        if (typeof that.onError === 'function') {
          that.onError('cronjob recieved error', {
            description: 'cronjob recieved error',
            error,
            uid
          })
        }
      })
    }, nextTimestamp - Date.now(), uid)
  }

  async setLoopTask (func: () => void | Promise<void>, uid: string): Promise<string> {
    const that = this
    return await this.setImmediate(function () {
      promiseTry(func)
        .catch((error) => {
          if (typeof that.onError === 'function') {
            that.onError('loop task recieved error', {
              description: 'loop task recieved error',
              error: error as Error,
              uid
            })
          }
        })
        .finally(() => {
          that.setLoopTask(func, uid)
        })
    }, uid)
  }
}

interface MongoAdapterOptions extends JoSkMongoAdapterOptions {
  collectionName?: string
}

export class MongoAdapter extends JoSkMongoAdapter {
  constructor (opts: MongoAdapterOptions) {
    super(opts)

    // we update to use different db
    if (typeof opts.collectionName === 'string') {
      // remove the old collection
      this.db.dropCollection(this.uniqueName).catch(console.log)
      this.uniqueName = `${opts.collectionName}${this.prefix}`
      this.collection = this.db.collection(this.uniqueName)
      ensureIndex(this.collection, { uid: 1 }, { background: false, unique: true })
      ensureIndex(this.collection, { uid: 1, isDeleted: 1 }, { background: false })
      ensureIndex(this.collection, { executeAt: 1 }, { background: false })
      // if no lock collection name is provided we use different one
      if (!(typeof opts.lockCollectionName === 'string')) {
        this.db.dropCollection(this.lockCollectionName).catch(() => {})
        this.lockCollectionName = `${opts.collectionName}.lock`
        this.lockCollection = this.db.collection(this.lockCollectionName)
        ensureIndex(this.lockCollection, { expireAt: 1 }, { background: false, expireAfterSeconds: 1 })
        ensureIndex(this.lockCollection, { uniqueName: 1 }, { background: false, unique: true })
      }

      // we execute the reset on init
      if (opts.resetOnInit) {
        this.collection.deleteMany({
          isInterval: false
        }).catch(() => {})

        this.lockCollection.deleteMany({
          uniqueName: this.uniqueName
        }).catch(() => {})
      }
    }
  }
}

export { RedisAdapter }
