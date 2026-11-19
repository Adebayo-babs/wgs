import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import { createApp } from './app.js';
import { resetStuckDeliveries } from './services/publish.js';

await connectDb();
await resetStuckDeliveries();

createApp().listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT}`);
});
