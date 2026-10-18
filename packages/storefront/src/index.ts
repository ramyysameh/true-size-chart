import { TrueSizeFinder } from './finder/element';
import { renderChart } from './finder/screens/chart';

// Tasks 6–7 register body, shape, fit and result here.
TrueSizeFinder.defaultScreens.set('chart', renderChart);

if (!customElements.get('true-size-finder')) customElements.define('true-size-finder', TrueSizeFinder);

export { TrueSizeFinder };
