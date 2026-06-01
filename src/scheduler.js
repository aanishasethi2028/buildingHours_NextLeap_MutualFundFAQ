import { runIngestion } from './ingestion.js';

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

export function startScheduler() {
  console.log(`[${new Date().toISOString()}] Initializing Daily Ingestion Scheduler...`);
  
  // Run on startup
  try {
    runIngestion();
  } catch (error) {
    console.error('Error running startup ingestion:', error);
  }

  // Set recurring daily interval (24 hours)
  const timerId = setInterval(() => {
    console.log(`[${new Date().toISOString()}] Ingestion Scheduler Trigger: Executing daily ingestion...`);
    try {
      runIngestion();
    } catch (e) {
      console.error('Error executing scheduled daily ingestion:', e);
    }
  }, MILLISECONDS_IN_A_DAY);

  // Return trigger controls for testability
  return {
    triggerNow: () => {
      console.log(`[${new Date().toISOString()}] Manual Scheduler Trigger Activated.`);
      return runIngestion();
    },
    stop: () => {
      clearInterval(timerId);
      console.log(`[${new Date().toISOString()}] Scheduler Stopped.`);
    }
  };
}
