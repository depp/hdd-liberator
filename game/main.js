import { COMPO } from './common.js';
import * as compo from './main.compo.js';
import * as standard from './main.standard.js';

if (COMPO) {
  compo.Start();
} else {
  standard.Start();
}
