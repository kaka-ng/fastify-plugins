import { type FastifyPluginAsync } from 'fastify'
import FastifyPlugin from 'fastify-plugin'
import { JoSkOptions } from 'josk'
import { CronJob } from './cronjob'

declare module 'fastify' {
  interface FastifyInstance {
    cronjob: CronJob
  }
}

export interface FastifyCronJobOption extends JoSkOptions {

}

const plugin: FastifyPluginAsync<FastifyCronJobOption> = async function (fastify, option) {
  const josk = new CronJob(option)

  fastify.decorate('cronjob', josk)

  fastify.addHook('onClose', () => {
    josk.destroy()
  })
}

export const fastifyCronJob = FastifyPlugin(plugin, {
  fastify: '5.x',
  name: '@kakang/fastify-cronjob',
  decorators: {
    fastify: [],
    request: [],
    reply: [],
  },
  dependencies: [],
  encapsulate: false,
})

export { MongoAdapter, RedisAdapter } from './cronjob'
