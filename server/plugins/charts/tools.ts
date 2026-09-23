import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { invoke } from '../../plugin-rpc.js';
export function chartTools() {
  return [
    defineTool({
      name: 'charts_datasets',
      label: 'Find SQL chart data',
      description:
        'Only when the user explicitly requests a chart: list up to the latest 20 saved SQL datasets in this conversation. Returns IDs, column names, timestamps and row counts without copying the data into context. Bounded to 10000 characters and the first 40 column names per dataset; columnsOmitted reports additional columns. Does not execute SQL.',
      parameters: Type.Object({}),
      async execute(_id, _args, signal) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(await invoke('charts_datasets', {}, signal)),
            },
          ],
          details: {},
        };
      },
    }),
    defineTool({
      name: 'charts_create',
      label: 'Create chart',
      description:
        'Create an inline chart ONLY when explicitly requested by the user, never automatically after a SQL query. Reference a datasetId from an MSSQL result or charts_datasets, exact x column and 1–5 numeric y columns. No raw/model-invented data. Bar/line use category x in SQL row order; scatter requires numeric x. Pie needs one nonnegative measure, unique categories, at most 20 rows. Other charts allow 1000 points across all series; aggregate/filter/order in SQL first if needed. NULLs remain gaps. Does not execute SQL. Requesting a chart is not approval for SQL mutations.',
      parameters: Type.Object({
        datasetId: Type.String(),
        kind: Type.Union(['bar', 'line', 'pie', 'scatter'].map((v) => Type.Literal(v))),
        title: Type.String(),
        x: Type.String(),
        y: Type.Array(Type.String()),
        donut: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, args, signal) {
        const chart = await invoke('charts_create', args, signal);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ chart, message: 'Chart displayed in the conversation.' }),
            },
          ],
          details: { chart },
        };
      },
    }),
  ];
}
