import Fastify from 'fastify'
import { MongoClient } from 'mongodb'
import { test, TestContext } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { fastifyCronJob, MongoAdapter } from '../lib'
import { MONGODB_URL } from './config'

test('MongoAdapter', async function (t: TestContext) {
  const client = new MongoClient(MONGODB_URL)
  await client.connect()

  const db = client.db('cicd')
  const fastify = Fastify()

  await fastify.register(fastifyCronJob, {
    adapter: new MongoAdapter({
      db,
      collectionName: 'sys.timer'
    })
  })

  await fastify.ready()

  const cronTick: Date[] = []
  const cron = await fastify.cronjob.setCronJob(() => {
    cronTick.push(new Date())
  }, '*/2 * * * * *', '*/2 * * * * *')
  await setTimeout(5000)
  fastify.cronjob.clearTimeout(cron)

  const loopTick: Date[] = []
  const loop = await fastify.cronjob.setLoopTask(async () => {
    loopTick.push(new Date())
    await setTimeout(1000)
  }, '1s')
  await setTimeout(3000)
  fastify.cronjob.clearTimeout(loop)

  await setTimeout(3000)
  t.assert.ok(cronTick.length >= 1 && cronTick.length <= 3)
  t.assert.ok(loopTick.length >= 1 && loopTick.length <= 3)

  await fastify.close()
  await setTimeout(500)
  await client.close()
})
