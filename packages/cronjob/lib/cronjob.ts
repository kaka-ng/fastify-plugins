import { parseExpression } from 'cron-parser'
import {
  JoSk,
  MongoAdapterOptions as JoSkMongoAdapterOptions,
  RedisAdapter
} from 'josk'
import { Collection, Db } from 'mongodb'

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

/**
 * Extracted from https://github.com/veliovgroup/josk/commit/e81e51ddbdb8f119331534616988ea81174da027
 * License as BSD 3-Clause "New" or "Revised" License https://github.com/veliovgroup/josk/blob/e81e51ddbdb8f119331534616988ea81174da027/LICENSE
 * It is modified to provide more customization.
  */

interface MongoAdapterOptions extends JoSkMongoAdapterOptions {
  collectionName?: string
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

const logError = (error: Error | unknown, ...args: unknown[]) => {
  if (error) {
    console.error('[josk] [MongoAdapter] [logError]:', error, ...args)
  }
}

export class MongoAdapter {
  name: string
  prefix: string
  collectionName: string
  lockCollectionName: string
  resetOnInit: boolean

  uniqueName: string
  db: Db
  collection: Collection
  lockCollection: Collection
  joskInstance!: JoSk

  constructor (opts: MongoAdapterOptions) {
    this.name = 'mongo'
    this.prefix = (typeof opts.prefix === 'string') ? opts.prefix : ''
    this.collectionName = opts.collectionName ?? '__JobTasks__'
    this.lockCollectionName = opts.lockCollectionName ?? `${this.collectionName}.lock`
    this.resetOnInit = opts.resetOnInit ?? false

    if (!opts.db) {
      const err: any = Error('{db} option is required for MongoAdapter')
      err.description = 'MongoDB database {db} option is required, e.g. returned from `MongoClient.connect` method'
      throw err
    }

    this.db = opts.db
    this.uniqueName = `${this.collectionName}${this.prefix}`
    this.collection = opts.db.collection(this.uniqueName)
    ensureIndex(this.collection, { uid: 1 }, { background: false, unique: true })
    ensureIndex(this.collection, { uid: 1, isDeleted: 1 }, { background: false })
    ensureIndex(this.collection, { executeAt: 1 }, { background: false })

    this.lockCollection = opts.db.collection(this.lockCollectionName)
    ensureIndex(this.lockCollection, { expireAt: 1 }, { background: false, expireAfterSeconds: 1 })
    ensureIndex(this.lockCollection, { uniqueName: 1 }, { background: false, unique: true })

    if (this.resetOnInit) {
      this.collection.deleteMany({
        isInterval: false
      }).then(() => {}).catch(logError)

      this.lockCollection.deleteMany({
        uniqueName: this.uniqueName
      }).then(() => {}).catch(logError)
    }
  }

  /**
   * @async
   * @memberOf MongoAdapter
   * @name ping
   * @description Check connection to MongoDB
   * @returns {Promise<object>}
   */
  async ping () {
    if (!this.joskInstance) {
      const reason = 'JoSk instance not yet assigned to {joskInstance} of Storage Adapter context'
      return {
        status: reason,
        code: 503,
        statusCode: 503,
        error: new Error(reason),
      }
    }

    try {
      const ping = await this.db.command({ ping: 1 })
      if (ping?.ok === 1) {
        return {
          status: 'OK',
          code: 200,
          statusCode: 200,
        }
      }
    } catch (pingError) {
      return {
        status: 'Internal Server Error',
        code: 500,
        statusCode: 500,
        error: pingError
      }
    }

    return {
      status: 'Service Unavailable',
      code: 503,
      statusCode: 503,
      error: new Error('Service Unavailable')
    }
  }

  async acquireLock () {
    const expireAt = new Date(Date.now() + this.joskInstance.zombieTime)

    try {
      const record = await this.lockCollection.findOne({
        uniqueName: this.uniqueName
      }, {
        projection: {
          uniqueName: 1
        }
      })

      if (record?.uniqueName === this.uniqueName) {
        return false
      }

      const result = await this.lockCollection.insertOne({
        uniqueName: this.uniqueName,
        expireAt
      })

      if (result.insertedId) {
        return true
      }
      return false
    } catch (opError: any) {
      if (opError?.code === 11000) {
        return false
      }

      this.joskInstance.__errorHandler(opError, '[acquireLock] [opError]', 'Exception inside MongoAdapter#acquireLock() method')
      return false
    }
  }

  async releaseLock () {
    await this.lockCollection.deleteOne({ uniqueName: this.uniqueName })
  }

  async remove (uid: string) {
    try {
      const result = await this.collection.findOneAndUpdate({
        uid,
        isDeleted: false
      }, {
        $set: {
          isDeleted: true
        }
      }, {
        returnDocument: 'before',
        projection: {
          _id: 1,
          isDeleted: 1
        }
      })

      const res = result?._id ? result : result?.value // mongodb 5 vs. 6 compatibility
      if (res?.isDeleted === false) {
        const deleteResult = await this.collection.deleteOne({ _id: res._id })
        return deleteResult?.deletedCount >= 1
      }

      return false
    } catch (opError: any) {
      this.joskInstance.__errorHandler(opError, '[remove] [opError]', 'Exception inside MongoAdapter#remove() method', uid)
      return false
    }
  }

  async add (uid: string, isInterval: boolean, delay: number) {
    const next = Date.now() + delay

    try {
      const task = await this.collection.findOne({
        uid
      })

      if (!task) {
        await this.collection.insertOne({
          uid,
          delay,
          executeAt: new Date(next),
          isInterval,
          isDeleted: false
        })

        return true
      }

      if (task.isDeleted === false) {
        let update: any = null
        if (task.delay !== delay) {
          update = { delay }
        }

        if (+task.executeAt !== next) {
          if (!update) {
            update = {}
          }
          update.executeAt = new Date(next)
        }

        if (update) {
          await this.collection.updateOne({
            uid
          }, {
            $set: update
          })
        }

        return true
      }

      return false
    } catch (opError: any) {
      this.joskInstance.__errorHandler(opError, '[add] [opError]', 'Exception inside MongoAdapter#add()', uid)
      return false
    }
  }

  async update (task: any, nextExecuteAt: Date) {
    if (typeof task !== 'object' || typeof task.uid !== 'string') {
      this.joskInstance.__errorHandler({ task }, '[MongoAdapter] [update] [task]', 'Task malformed or undefined')
      return false
    }

    if (!(nextExecuteAt instanceof Date)) {
      this.joskInstance.__errorHandler({ nextExecuteAt }, '[MongoAdapter] [update] [nextExecuteAt]', 'Next execution date is malformed or undefined', task.uid)
      return false
    }

    try {
      const updateResult = await this.collection.updateOne({
        uid: task.uid
      }, {
        $set: {
          executeAt: nextExecuteAt
        }
      })
      return updateResult?.modifiedCount >= 1
    } catch (opError) {
      this.joskInstance.__errorHandler(opError, '[MongoAdapter] [update] [opError]', 'Exception inside RedisAdapter#update() method', task.uid)
      return false
    }
  }

  async iterate (nextExecuteAt: Date) {
    const _ids = []
    const tasks = []

    const cursor = this.collection.find({
      executeAt: {
        $lte: new Date()
      }
    }, {
      projection: {
        _id: 1,
        uid: 1,
        delay: 1,
        isDeleted: 1,
        isInterval: 1
      }
    })

    try {
      let task: any
      while (await cursor.hasNext()) {
        task = await cursor.next()
        _ids.push(task._id)
        tasks.push(task)
      }
      await this.collection.updateMany({
        _id: {
          $in: _ids
        }
      }, {
        $set: {
          executeAt: nextExecuteAt
        }
      })
    } catch (mongoError) {
      logError('[iterate] mongoError:', mongoError)
    }

    for (const task of tasks) {
      this.joskInstance.__execute(task)
    }

    await cursor.close()
  }
}

export { RedisAdapter }
