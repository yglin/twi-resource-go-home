import { createDocument } from './firestoreService';
import { auth } from '../firebase';

export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface SystemLog {
  id?: string;
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  details?: string;
  userId?: string;
  userEmail?: string;
}

export async function logToSystem(
  level: LogLevel,
  message: string,
  service: string,
  details?: any
) {
  const consoleMsg = `[${level.toUpperCase()}] [${service}] ${message}`;
  if (level === LogLevel.ERROR) {
    console.error(consoleMsg, details);
  } else if (level === LogLevel.WARN) {
    console.warn(consoleMsg, details);
  } else {
    console.log(consoleMsg, details);
  }

  try {
    const userId = auth.currentUser?.uid || 'anonymous';
    const userEmail = auth.currentUser?.email || 'anonymous';
    
    let detailsString = '';
    if (details) {
      if (details instanceof Error) {
        detailsString = `${details.message}\n${details.stack || ''}`;
      } else if (typeof details === 'object') {
        try {
          detailsString = JSON.stringify(details, null, 2);
        } catch (e) {
          detailsString = String(details);
        }
      } else {
        detailsString = String(details);
      }
    }

    const logData = {
      level,
      message: message.substring(0, 1000),
      timestamp: new Date().toISOString(),
      service,
      details: detailsString.substring(0, 1900), // Safe safety cushion within rules' 2000 limit
      userId,
      userEmail
    };

    await createDocument('systemLogs', logData);
  } catch (err) {
    console.error('Failed to write log to Firestore:', err);
  }
}
