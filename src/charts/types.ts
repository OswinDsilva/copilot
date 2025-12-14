export type ChartStatus = 'pending' | 'processing' | 'done' | 'failed';

export type ChartJob = {
    id : string;
    status : ChartStatus;
    // Progress from 0 to 100, if possible, else omit
    progress? : number;
    // unit metadata
    progress_unit? : 'percent' | 'fraction';  
    // status/error message
    message? : string;                         
    chart_config? : ChartConfig;
    chart_data_url? : string;
    chart_data? : ChartData;
    created_at? : string;
    finished_at? : string;
}

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'radar' | 'pareto' | 'heatmap' | 'custom';

export type ChartConfig = XYChartConfig | ScatterChartConfig | ParetoChartConfig | RadarChartConfig | PieChartConfig | HeatmapChartConfig | CustomChartConfig;

export interface BaseChartConfig {
    chart_type : ChartType;
    title? : string;
    legend? : boolean;
    tooltip? : boolean;
    metadata? : Record<string, any>;
}

export interface XYChartConfig extends BaseChartConfig {
    chart_type : 'bar' | 'line' | 'area';
    x_column : string;
    x_type? : 'datetime' | 'numeric' | 'categorical';
    y_columns : string[]; 
    aggregation? : Record<string, {fn : 'sum' | 'avg' | 'count' | 'min' | 'max',bucket?: string}>;
}

export interface ScatterChartConfig extends BaseChartConfig {
    chart_type : 'scatter';
    x_column : string;
    y_column : string;
    size? : string;
    colors? : string[]; 
}

export interface ParetoChartConfig extends BaseChartConfig {
    chart_type : 'pareto';
    category_column : string;
    value_column : string;
    // Default value should be 'desc'
    sort? : 'asc' | 'desc';
}

// Spider chart
export interface RadarChartConfig extends BaseChartConfig {
    chart_type : 'radar';
    category_column : string;
    axes :  string[];
}

export interface PieChartConfig extends BaseChartConfig {
    chart_type : 'pie';
    category_column : string;
    value_column : string;
}

export interface HeatmapChartConfig extends BaseChartConfig {
    chart_type : 'heatmap';
    x_column : string;
    y_column : string;
    value_column : string;
}

export interface CustomChartConfig extends BaseChartConfig {
    chart_type : 'custom';
}

export type ChartRow = Record<string, string | number | null>;

export type ChartData = ChartRow[];

export type PrepareChartRequest = {
    user_id : string;
    source_type : 'sql_result' | 'csv' | 'table';
    // Only one of the below should be set at any given time based on the source_type
    source_ref? : {
        // Pointer to csv uploaded by user
        csv? : {
            csv_id : string;
            file_name? :string;
        }
        // Pointer to previous SQL result
        sql_result? : {
            query_id : string;
            query_hash? : string;
        }
        // Pointer to a database table
        table? : {
            table_name : string;
            schema_name? : string;
            database_name? : string;
        }
    }
    data_sample? : ChartData;
    hints?: {
        prefer_chart_types?: ChartType[];
        max_rows_sample?: number;
        [key: string]: any;
    };
    params? : {
        chart_type? : ChartType;
        x_column? : string;
        y_columns? : string[];
        category_column? : string;
        value_column? : string;
        bucket? : string;
        aggregation? : Record<string, {fn : 'sum' | 'avg' | 'count' | 'min' | 'max',bucket?: string}>;
        sample_rate? : number;
        max_rows? : number;
        timeout_ms? : number;
        extra? : Record<string, any>;
    }
}