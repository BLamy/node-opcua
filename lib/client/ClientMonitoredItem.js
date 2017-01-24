/**
 * @module opcua.client
 */
import util from "util";
import { EventEmitter } from "events";
import subscription_service from "lib/services/subscription_service";
import {
  AttributeIds,
  TimestampsToReturn,
  ReadValueId
} from "lib/services/read_service";
import { StatusCodes } from "lib/datamodel/opcua_status_code";
import assert from "better-assert";

import { resolveNodeId } from "lib/datamodel/nodeid";
import { ObjectTypeIds } from "lib/opcua_node_ids";
import _ from "underscore";

/**
 * ClientMonitoredItem
 * @class ClientMonitoredItem
 * @extends EventEmitter
 *
 * @param subscription              {ClientSubscription}
 * @param itemToMonitor             {ReadValueId}
 * @param itemToMonitor.nodeId      {NodeId}
 * @param itemToMonitor.attributeId {AttributeId}
 *
 * @param monitoringParameters      {MonitoringParameters}
 * @param timestampsToReturn        {TimestampsToReturn}
 * @constructor
 *
 * event:
 *    "initialized"
 *    "err"
 *    "changed"
 *
 *  note: this.monitoringMode = subscription_service.MonitoringMode.Reporting;
 */
class ClientMonitoredItem extends EventEmitter {
  constructor(subscription, itemToMonitor, monitoringParameters, timestampsToReturn) {
    super();
    timestampsToReturn = timestampsToReturn || TimestampsToReturn.Neither;

    assert(subscription.constructor.name === "ClientSubscription");

    this.itemToMonitor = new ReadValueId(itemToMonitor);
    this.monitoringParameters = new subscription_service.MonitoringParameters(monitoringParameters);
    this.subscription = subscription;
    this.timestampsToReturn = timestampsToReturn;

    this.monitoringMode = subscription_service.MonitoringMode.Reporting;
  }

  toString() {
    const self = this;
    let ret = "";
    ret += `itemToMonitor:        ${self.itemToMonitor.toString()}\n`;
    ret += `monitoringParameters: ${self.monitoringParameters.toString()}\n`;
    ret += `timestampsToReturn:   ${self.timestampsToReturn.toString()}\n`;
    ret += `monitoredItemId       ${self.monitoredItemId}\n`;
    ret += `statusCode:           ${self.statusCode}` ? self.statusCode.toString() : "";
    return ret;
  }

  /**
   * remove the MonitoredItem from its subscription
   * @method terminate
   * @param  done {Function} the done callback
   * @async
   */
  terminate(done) {
    assert(!done || _.isFunction(done));
    const self = this;
      /**
       * Notify the observer that this monitored item has been terminated.
       * @event terminated
       */
    self.emit("terminated");

    self.subscription._delete_monitored_item(self, (err) => {
      if (done) {
        done(err);
      }
    });
  }

  _notify_value_change(value) {
    const self = this;
      /**
       * Notify the observers that the MonitoredItem value has changed on the server side.
       * @event changed
       * @param value
       */
    self.emit("changed", value);
  }

  /**
   * @method _monitor
   * Creates the monitor item (monitoring mode = Reporting)
   * @param done {Function} callback
   * @private
   */
  _monitor(done) {
    assert(done === undefined || _.isFunction(done));

    function handle_error(err_message) {
      console.log(` ERROR ${err_message.cyan}`);
      if (done) {
        return done(new Error(err_message));
      }
      throw new Error(err_message);
    }

    const self = this;

    assert(self.subscription.subscriptionId !== "pending");

    self.monitoringParameters.clientHandle = self.subscription.nextClientHandle();
    assert(self.monitoringParameters.clientHandle > 0);

      // If attributeId is EventNotifier then monitoring parameters need a filter.
      // The filter must then either be DataChangeFilter, EventFilter or AggregateFilter.
      // todo can be done in another way?
      // todo implement AggregateFilter
      // todo support DataChangeFilter
      // todo support whereClause
    if (self.itemToMonitor.attributeId === AttributeIds.EventNotifier) {
          //
          // see OPCUA Spec 1.02 part 4 page 65 : 5.12.1.4 Filter
          // see                 part 4 page 130: 7.16.3 EventFilter
          //                     part 3 page 11 : 4.6 Event Model
          // To monitor for Events, the attributeId element of the ReadValueId structure is the
          // the id of the EventNotifierAttribute

          // OPC Unified Architecture 1.02, Part 4 5.12.1.2 Sampling interval page 64:
          // "A Client shall define a sampling interval of 0 if it subscribes for Events."
          // toDO

          // note : the EventFilter is used when monitoring Events.
      self.monitoringParameters.filter = self.monitoringParameters.filter || new subscription_service.EventFilter({});

      const filter = self.monitoringParameters.filter;
      if (filter._schema.name !== "EventFilter") {
        return handle_error(
                  `Mismatch between attributeId and filter in monitoring parameters : Got a ${filter._schema.name} but a EventFilter object is required when itemToMonitor.attributeId== AttributeIds.EventNotifier`);
      }
    } else if (self.itemToMonitor.attributeId === AttributeIds.Value) {
          // the DataChangeFilter and the AggregateFilter are used when monitoring Variable Values

          // The Value Attribute is used when monitoring Variables. Variable values are monitored for a change
          // in value or a change in their status. The filters defined in this standard (see 7.16.2) and in Part 8 are
          // used to determine if the value change is large enough to cause a Notification to be generated for the
          // to do : check 'DataChangeFilter'  && 'AggregateFilter'
    } else if (self.monitoringParameters.filter) {
      return handle_error(
                  "Mismatch between attributeId and filter in monitoring parameters : " +
                  "no filter expected when attributeId is not Value  or  EventNotifier"
              );
    }


    const createMonitorItemsRequest = new subscription_service.CreateMonitoredItemsRequest({

      subscriptionId:     self.subscription.subscriptionId,
      timestampsToReturn: self.timestampsToReturn,
      itemsToCreate: [
        {
          itemToMonitor: self.itemToMonitor,
          monitoringMode: self.monitoringMode,
          requestedParameters: self.monitoringParameters
        }
      ]
    });

    assert(self.subscription.session);
    self.subscription.session.createMonitoredItems(createMonitorItemsRequest, (err, response) => {
          /* istanbul ignore next */
      if (err) {
        console.log("ClientMonitoredItem#_monitor:  ERROR in createMonitoredItems ".red, err.message);
        console.log(createMonitorItemsRequest.toString());
        self.emit("err", err.message);
        self.emit("terminated");
      } else {
        assert(response instanceof subscription_service.CreateMonitoredItemsResponse);
        assert(response.results.length === 1);
        const monitoredItemResult = response.results[0];

        self.statusCode = monitoredItemResult.statusCode;
              /* istanbul ignore else */
        if (monitoredItemResult.statusCode === StatusCodes.Good) {
          self.result = monitoredItemResult;
          self.monitoredItemId                       = monitoredItemResult.monitoredItemId;
          self.monitoringParameters.samplingInterval = monitoredItemResult.revisedSamplingInterval;
          self.monitoringParameters.queueSize        = monitoredItemResult.revisedQueueSize;
          self.filterResult                          = monitoredItemResult.filterResult;

          self.subscription._add_monitored_item(self.monitoringParameters.clientHandle, self);
                  /**
                   * Notify the observers that the monitored item is now fully initialized.
                   * @event initialized
                   */
          self.emit("initialized");
        } else {
                  // xx console.log(" monitoredItemResult statusCode = ".red, monitoredItemResult.statusCode.toString());
                  // xx require("lib/misc/utils").dump(response);
                  // xx require("lib/misc/utils").dump(createMonitorItemsRequest);

                  /**
                   * Notify the observers that the monitored item has failed to initialized.
                   * @event err
                   * @param statusCode {StatusCode}
                   */
          err = new Error(monitoredItemResult.statusCode.toString());
          self.emit("err", err.message);
          self.emit("terminated");
        }
      }
      if (done) {
        done(err);
      }
    });
  }

  /**
   * @method modify
   * @param parameters {Object}
   * @param [timestampsToReturn=null] {TimestampsToReturn}
   * @param callback {Function}
   */
  modify(parameters, timestampsToReturn, callback) {
    const self = this;

    if (_.isFunction(timestampsToReturn)) {
      callback = timestampsToReturn;
      timestampsToReturn = null;
    }

    parameters.clientHandle = parameters.clientHandle || self.monitoringParameters.clientHandle;

    assert(callback === undefined || _.isFunction(callback));

      // xx console.log(" parameters = ",parameters);

    const modifyMonitoredItemsRequest = new ModifyMonitoredItemsRequest({
      subscriptionId: self.subscription.subscriptionId,
      timestampsToReturn: timestampsToReturn || self.timestampsToReturn,
      itemsToModify: [
        new MonitoredItemModifyRequest({
          monitoredItemId: self.monitoredItemId,

          requestedParameters: parameters
        })
      ]
    });

    self.subscription.session.modifyMonitoredItems(modifyMonitoredItemsRequest, (err, response) => {
          /* istanbul ignore next */
      if (err) {
        return callback(err);
      }
      assert(response.results.length === 1);

      const res = response.results[0];

          /* istanbul ignore next */
      if (res.statusCode !== StatusCodes.Good) {
        return callback(new Error(`Error${res.statusCode.toString()}`));
      }
      callback(null, response.results[0]);
    });
  }

  setMonitoringMode(monitoringMode, callback) {
    const self = this;

    self.monitoringMode = monitoringMode;

    const setMonitoringModeRequest = {
      subscriptionId: self.subscription.subscriptionId,
      monitoringMode: self.monitoringMode,
      monitoredItemIds: [self.monitoredItemId]
    };
    self.subscription.session.setMonitoringMode(setMonitoringModeRequest, (err, results) => {
      if (callback) {
        callback(err,results ? results[0] : null);
      }
    });
  }
}

const ModifyMonitoredItemsRequest = subscription_service.ModifyMonitoredItemsRequest;
const MonitoredItemModifyRequest = subscription_service.MonitoredItemModifyRequest;

export default ClientMonitoredItem;