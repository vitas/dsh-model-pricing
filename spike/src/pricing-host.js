export const name = 'model-pricing-spike'

export function apply(ctx) {
  console.log('[model-pricing-spike] apply() ran')
  ctx.inject(['webServer'], (c) => {
    console.log('[model-pricing-spike] webServer mounted, registering /model-pricing/snapshot')
    const dispose = c.webServer.register({
      kind: 'exact',
      path: '/model-pricing/snapshot',
      handler(req, res) {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true, spike: true, generatedAt: new Date().toISOString(), rows: [] }))
      },
    })
    ctx.effect(() => dispose)
  })
}
