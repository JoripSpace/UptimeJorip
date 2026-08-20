#!/usr/bin/env node
import { runCheckpointCommand } from './checkpoint-client.mjs';
runCheckpointCommand('list').catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
