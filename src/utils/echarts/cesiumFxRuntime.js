import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

let registered = false;

export function getCesiumFxEchartsRuntime() {
  if (!registered) {
    echarts.use([
      LineChart,
      GridComponent,
      LegendComponent,
      TooltipComponent,
      CanvasRenderer
    ]);
    registered = true;
  }

  return echarts;
}
