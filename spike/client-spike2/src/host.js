import { appendFileSync } from 'node:fs'
const log = (m) => appendFileSync('/tmp/spike2.log', `${m} ${new Date().toISOString()}\n`)
log('module evaluated')
export const name = 'dsh-model-pricing-spike2-host'
export function apply(ctx) {
  log('apply ran')
  ctx.inject(['webServer'], (c) => {
    log('webServer ready, registering')
    const dispose = c.webServer.register({
      kind: 'exact',
      path: '/model-pricing/spike2-probe',
      handler(req, res) { res.writeHead(200); res.end('{"spike2":true}') },
    })
    ctx.effect(() => dispose)
  })
}
