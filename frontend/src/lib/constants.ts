// UUID is the default and recommended type for primary keys
export const DATA_TYPES = [
  // Basic types
  'uuid',
  'text',
  'integer',
  'bigint',
  'boolean',
  'character varying',
  'varchar',
  'character',
  'char',
  'name',

  // Numeric types
  'smallint',
  'int2',
  'int',
  'int4',
  'int8',
  'real',
  'float4',
  'double precision',
  'float8',
  'numeric',
  'decimal',

  // Serial types
  'serial',
  'serial2',
  'serial4',
  'bigserial',
  'serial8',
  'smallserial',

  // Date/Time types
  'date',
  'time',
  'time without time zone',
  'timetz',
  'time with time zone',
  'timestamp',
  'timestamp without time zone',
  'timestamptz',
  'timestamp with time zone',

  // JSON types
  'json',
  'jsonb',

  // Special types
  'interval',
  'money',
  'bytea',

  // Network types
  'inet',
  'cidr',

  // MAC address types
  'macaddr',
  'macaddr8',

  // Bit string types
  'bit',
  'bit varying',
  'varbit',
] as const;

export type DataType = (typeof DATA_TYPES)[number];

// Default type for new columns
export const DEFAULT_COLUMN_TYPE: DataType = 'text';
