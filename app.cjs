// CommonJS entry point for hosts that start the app with require() (Hostinger Node.js apps, LiteSpeed, Passenger).
// The server itself is an ES module, so load it with a dynamic import.
import('./server/index.js').catch(err => {
  console.error('[hanpan] failed to start server:', err);
  process.exit(1);
});
