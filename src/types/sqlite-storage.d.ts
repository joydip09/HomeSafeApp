declare module 'react-native-sqlite-storage' {
  type ResultSet = { rows: { length: number; item(index: number): any } };
  type Database = {
    executeSql(query: string, params?: unknown[]): Promise<ResultSet[]>;
  };
  const SQLite: {
    enablePromise(enabled: boolean): void;
    openDatabase(options: {
      name: string;
      location: string;
    }): Promise<Database>;
  };
  export default SQLite;
}
