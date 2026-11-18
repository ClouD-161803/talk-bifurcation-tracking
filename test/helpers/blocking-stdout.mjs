// loaded into each process of the test command with --import. With --test-force-exit, a test file
// is ended by process.exit(), which drops the writes to a pipe that are still queued, and with them
// the reports of its last tests. A write to a blocking pipe is done when write() returns
process.stdout._handle?.setBlocking?.(true);
