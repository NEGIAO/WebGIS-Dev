import * as echarts from 'echarts/core';
import { BarChart, GaugeChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkPointComponent,
  TooltipComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

let registered = false;

export function getWeatherEchartsRuntime() {
  if (!registered) {
    echarts.use([
      LineChart,
      BarChart,
      GaugeChart,
      GridComponent,
      TooltipComponent,
      LegendComponent,
      MarkPointComponent,
      CanvasRenderer
    ]);
    registered = true;
  }

  return echarts;
}
