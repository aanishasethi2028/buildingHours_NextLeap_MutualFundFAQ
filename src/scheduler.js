import { runIngestion } from './ingestion.js';
import cron from 'node-cron';

export function startScheduler() {
  console.log(`[${new Date().toISOString()}] Initializing Daily Ingestion Scheduler...`);
  
  // Run on startup
  try {
    runIngestion();
  } catch (error) {
    console.error('Error running startup ingestion:', error);
  }

  // Set recurring daily schedule at 10:00 AM IST
  // IST is UTC+5:30. "0 10 * * *" with timezone 'Asia/Kolkata' handles it correctly.
  const task = cron.schedule('0 10 * * *', () => {
    console.log(`[${new Date().toISOString()}] Ingestion Scheduler Trigger: Executing daily ingestion (10:00 AM IST)...`);
    try {
      runIngestion();
    } catch (e) {
      console.error('Error executing scheduled daily ingestion:', e);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });

  // Return trigger controls for testability
  return {
    triggerNow: () => {
      console.log(`[${new Date().toISOString()}] Manual Scheduler Trigger Activated.`);
      return runIngestion();
    },
    stop: () => {
      task.stop();
      console.log(`[${new Date().toISOString()}] Scheduler Stopped.`);
    }
  };
}
