import { spawnSync } from 'node:child_process';

function run(cmd, args) {
	const res = spawnSync(cmd, args, {
		stdio: 'inherit',
		env: process.env
	});
	if (res.error) throw res.error;
	process.exitCode = res.status ?? 1;
	if (process.exitCode) process.exit(process.exitCode);
}

const env = (process.env.NODE_ENV ?? '').toLowerCase();

// In this repo, migrations are not a complete history from an empty DB.
// For local/dev Docker we use `db push` to materialize the schema.
if (env === 'production') {
	run('npx', ['prisma', 'migrate', 'deploy']);
} else {
	run('npx', ['prisma', 'db', 'push', '--accept-data-loss']);
}
