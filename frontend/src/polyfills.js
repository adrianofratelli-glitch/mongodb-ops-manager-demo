import { Buffer } from 'buffer';
import process from 'process';

// Only the Node globals required by the LeafyGreen dependency chain.
Object.assign(globalThis, { Buffer, process });

export { Buffer, process };
