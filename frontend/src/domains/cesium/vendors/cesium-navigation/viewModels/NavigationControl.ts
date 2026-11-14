import UserInterfaceControl from './UserInterfaceControl'
/**
 * The view-model for a control in the navigation control tool bar
 *
 * @alias NavigationControl
 * @constructor
 * @abstract
 *
 * @param {Terria} terria The Terria instance.
 */
var NavigationControl: any = function (this: any, terria: any) {
  UserInterfaceControl.call(this, terria)
}

NavigationControl.prototype = Object.create(UserInterfaceControl.prototype)

export default NavigationControl
