import Fastify from 'fastify'
import { GridFSBucket, MongoClient } from 'mongodb'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { test, TestContext } from 'node:test'
import { FastifyStatic, MongoDBEngine } from '../../lib'
import { MONGODB_URL } from '../config'

const fixtures = join(__dirname, '..', 'fixtures')

test('mongodb engine', async (t: TestContext) => {
  const mongodb = await MongoClient.connect(MONGODB_URL)
  const db = mongodb.db('cicd')
  const bucket = new GridFSBucket(db, {
    bucketName: 'cicd'
  })

  t.after(() => {
    mongodb.close()
  })

  const engine = new MongoDBEngine({ bucket })
  const root = join(fixtures, 'example-spa')

  const fastify = Fastify()
  fastify.register(FastifyStatic, {
    root,
    engine
  })

  await fastify.ready()

  // we insert file
  const filepath = join(root, 'index.html')
  const content = await readFile(filepath, { encoding: 'utf8' })
  await fastify.static.upload('index.html', Readable.from([content]))

  const response = await fastify.inject('/index.html')
  t.assert.equal(response.statusCode, 200)
  t.assert.equal(response.body, content)
})
