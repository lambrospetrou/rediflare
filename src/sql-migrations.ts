export interface SchemaMigration {
	idMonotonicInc: number;
	description: string;

	sql?: string;
}

export interface SchemaMigrationsConfig {
	doStorage: DurableObjectStorage;
	migrations: SchemaMigration[];

	__lastAppliedMigrationMonotonicID_OVERRIDE_FOR_MANUAL_MIGRATIONS?: number;
}

export class SchemaMigrations {
	_config: Omit<SchemaMigrationsConfig, '__lastAppliedMigrationMonotonicID_OVERRIDE_FOR_MANUAL_MIGRATIONS'>;
	_migrations: SchemaMigration[];

    _lastMigrationMonotonicId: number = -1

	constructor(config: SchemaMigrationsConfig) {
		this._config = config;

		const migrations = [...config.migrations];
		migrations.sort((a, b) => a.idMonotonicInc - b.idMonotonicInc);
		const idSeen = new Map<number, SchemaMigration>();
		migrations.forEach((m) => {
			if (m.idMonotonicInc < 0) {
				throw new Error(`migration ID cannot be negative: ${m.idMonotonicInc}`);
			}
			if (idSeen.has(m.idMonotonicInc)) {
				throw new Error(`duplicate migration ID detected: ${m.idMonotonicInc}`);
			}
		});

		this._migrations = migrations;

		if (config.__lastAppliedMigrationMonotonicID_OVERRIDE_FOR_MANUAL_MIGRATIONS) {
			this._config.doStorage.put<number>('_rf_migrations_lastID', config.__lastAppliedMigrationMonotonicID_OVERRIDE_FOR_MANUAL_MIGRATIONS);
		}
	}

    hasMigrationsToRun() {
        if (!this._migrations.length) {
            return false;
        }
        return this._lastMigrationMonotonicId !== this._migrations[this._migrations.length-1].idMonotonicInc;
    }

	async runAll(sqlGen?: (idMonotonicInc: number) => string) {
		const result = {
			rowsRead: 0,
			rowsWritten: 0,
		};

		if (!this.hasMigrationsToRun()) {
			return result;
		}

		// TODO Should this be in a table itself, and increment its counter as part of the queries running in the migration???
		this._lastMigrationMonotonicId = (await this._config.doStorage.get<number>('_rf_migrations_lastID')) ?? -1;

		// Skip all the applied ones.
		let idx = 0,
			sz = this._migrations.length;
		while (idx < sz && this._migrations[idx].idMonotonicInc <= this._lastMigrationMonotonicId) {
			idx += 1;
		}

		// Make sure we still have migrations to run.
		if (idx === sz) {
			return result;
		}

		const doSql = this._config.doStorage.sql;
		this._migrations.forEach((migration) => {
			let query = migration.sql ?? sqlGen?.(migration.idMonotonicInc);
			if (!query) {
				throw new Error(`migration with neither 'sql' nor 'sqlGen' provided: ${migration.idMonotonicInc}`);
			}

			const cursor = doSql.exec(query);
			let _ = cursor.toArray();

			result.rowsRead += cursor.rowsRead;
			result.rowsWritten += cursor.rowsWritten;

			this._lastMigrationMonotonicId = migration.idMonotonicInc;
			// What happens if we fail just before this?
			this._config.doStorage.put<number>('_rf_migrations_lastID', this._lastMigrationMonotonicId);
		});

		return result;
	}
}
