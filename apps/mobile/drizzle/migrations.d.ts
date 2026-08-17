interface MigrationBundle {
  readonly journal: {
    readonly entries: Array<{
      readonly idx: number;
      readonly when: number;
      readonly tag: string;
      readonly breakpoints: boolean;
    }>;
  };
  readonly migrations: Record<string, string>;
}

declare const migrations: MigrationBundle;

export default migrations;
