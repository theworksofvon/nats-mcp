export interface BackupFile {
    name: string;
    timestamp: Date;
    metadata: {
        stream?: string;
        timestamp?: string;
        version?: string;
    };
}

export type FilteredMessage = {
    sequence: number;
    subject: string;
    time?: string | number | Date;
    header?: any;
    data: string;
  };

  export type HeaderMatchMessage = {
    sequence: number;
    subject: string;
    time?: string | number | Date;
    header?: any;
    headerValue: string | undefined;
    data: string;
  };