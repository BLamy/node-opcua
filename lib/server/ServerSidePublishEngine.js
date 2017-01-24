/**
 * @module opcua.server
 */
import Subscription from "lib/server/Subscription";
import SubscriptionState from "lib/server/SubscriptionState";
import subscription_service from "lib/services/subscription_service";
import { StatusCodes } from "lib/datamodel/opcua_status_code";
import assert from "better-assert";
import _ from "underscore";
import { EventEmitter } from "events";
import util from "util";
import { make_debugLog, checkDebugFlag } from "lib/misc/utils";

import colors from "colors";


const NotificationMessage = subscription_service.NotificationMessage;

const debugLog = make_debugLog(__filename);
const doDebug = checkDebugFlag(__filename);


function traceLog(...args) {
  if (!doDebug) { return; }
  const a = _.map(args);
  // console.log(a);
  a.unshift(" TRACE ".yellow);
  console.log.apply(this, a);
}

/** *
 * @class ServerSidePublishEngine
 * @param options {Object}
 * @param [options.maxPublishRequestInQueue= 100] {Integer}
 * @constructor
 */
class ServerSidePublishEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    const self = this;

    // a queue of pending publish request send by the client
    // waiting to be used by the server to send notification
    self._publish_request_queue = []; // { request :/*PublishRequest*/{}, results: [/*subscriptionAcknowledgements*/] , callback}
    self._publish_response_queue = [];// /* PublishResponse */

    self._subscriptions = {};
    self._closed_subscriptions = [];

    self.maxPublishRequestInQueue = options.maxPublishRequestInQueue || 100;

    self.isSessionClosed = false;
  }

  process_subscriptionAcknowledgements(subscriptionAcknowledgements = []) {
    // process acknowledgements
    const self = this;

    const results = subscriptionAcknowledgements.map((subscriptionAcknowledgement) => {
      const subscription = self.getSubscriptionById(subscriptionAcknowledgement.subscriptionId);
      if (!subscription) {
        return StatusCodes.BadSubscriptionIdInvalid;
      }
      return subscription.acknowledgeNotification(subscriptionAcknowledgement.sequenceNumber);
    });

    return results;
  }

  _feed_late_subscription() {
    const self = this;
    if (!self.pendingPublishRequestCount) {
      return;
    }
    const starving_subscription = self.findSubscriptionWaitingForFirstPublish() || self.findLateSubscriptionSortedByPriority();

    if (starving_subscription) {
      debugLog("feeding most late subscription subscriptionId  = ".bgWhite.red, starving_subscription.id);
      starving_subscription.process_subscription();
    }
  }

  _feed_closed_subscription() {
    const self = this;
    if (!self.pendingPublishRequestCount) {
      return false;
    }

    debugLog("ServerSidePublishEngine#_feed_closed_subscription");
    const closed_subscription = self._closed_subscriptions.shift();
    if (closed_subscription) {
      traceLog("_feed_closed_subscription for closed_subscription ", closed_subscription.id);

      if (closed_subscription.hasPendingNotifications) {
        closed_subscription._publish_pending_notifications();
        return true;
      }
    }
    return false;
  }

  send_error_for_request(publishData, statusCode) {
    const self = this;
    _assertValidPublishData(publishData);
    self.send_response_for_request(publishData, new subscription_service.PublishResponse({
      responseHeader: { serviceResult: statusCode }
    }));
  }

  _cancelPendingPublishRequest(statusCode) {
    const self = this;
    debugLog("Cancelling pending PublishRequest with statusCode  ".red, statusCode.toString(), " length =", self._publish_request_queue.length);

    self._publish_request_queue.forEach((publishData) => {
      self.send_error_for_request(publishData, statusCode);
    });
    self._publish_request_queue = [];
  }

  cancelPendingPublishRequestBeforeChannelChange() {
    this._cancelPendingPublishRequest(StatusCodes.BadSecureChannelClosed);
  }

  cancelPendingPublishRequest() {
    const self = this;
    assert(self.subscriptionCount === 0);
    this._cancelPendingPublishRequest(StatusCodes.BadNoSubscription);
  }

  onSessionClose() {
    const self = this;
    self.isSessionClosed = true;
    self._cancelPendingPublishRequest(StatusCodes.BadSessionClosed);
  }

  _handle_too_many_requests() {
    const self = this;

    if (self.pendingPublishRequestCount > self.maxPublishRequestInQueue) {
      traceLog("server has received too many PublishRequest", self.pendingPublishRequestCount, "/", self.maxPublishRequestInQueue);
      assert(self.pendingPublishRequestCount === (self.maxPublishRequestInQueue + 1));
      // When a Server receives a new Publish request that exceeds its limit it shall de-queue the oldest Publish
      // request and return a response with the result set to Bad_TooManyPublishRequests.

      // dequeue oldest request
      const publishData = self._publish_request_queue.shift();
      self.send_error_for_request(publishData, StatusCodes.BadTooManyPublishRequests);
    }
  }

  _on_PublishRequest(request, callback) {
    const self = this;
    // xx console.log("#_on_PublishRequest self._publish_request_queue.length before ",self._publish_request_queue.length);

    callback = callback || dummy_function;
    assert(request instanceof subscription_service.PublishRequest);

    assert(_.isFunction(callback));

    const subscriptionAckResults = self.process_subscriptionAcknowledgements(request.subscriptionAcknowledgements);
    const publishData = { request, results: subscriptionAckResults, callback };

    if (self._process_pending_publish_response(publishData)) {
      console.log(" PENDING RESPONSE HAS BEEN PROCESSED !");
      return;
    }

    if (self.isSessionClosed) {
      traceLog("server has received a PublishRequest but session is Closed");
      self.send_error_for_request(publishData, StatusCodes.BadSessionClosed);
    } else if (self.subscriptionCount === 0) {
      if (self._closed_subscriptions.length > 0 && self._closed_subscriptions[0].hasPendingNotifications) {
        const verif = self._publish_request_queue.length;
        // add the publish request to the queue for later processing
        self._publish_request_queue.push(publishData);

        const processed = self._feed_closed_subscription();
        assert(verif === self._publish_request_queue.length);
        assert(processed);
        return;
      }
      // Xx        assert(self._publish_request_queue.length===0);
      traceLog("server has received a PublishRequest but has no subscription opened");
      self.send_error_for_request(publishData, StatusCodes.BadNoSubscription);
    } else {
      prepare_timeout_info(request);

      // add the publish request to the queue for later processing
      self._publish_request_queue.push(publishData);

      debugLog("Adding a PublishRequest to the queue ".bgWhite.red, self._publish_request_queue.length);

      self._feed_late_subscription();

      self._feed_closed_subscription();

      self._handle_too_many_requests();
    }
  }

  /**
   * call by a subscription when no notification message is available after the keep alive delay has
   * expired.
   *
   * @method send_keep_alive_response
   * @param subscriptionId
   * @param future_sequence_number
   * @return {Boolean} true if a publish response has been sent
   */
  send_keep_alive_response(subscriptionId, future_sequence_number) {
    //  this keep-alive Message informs the Client that the Subscription is still active.
    //  Each keep-alive Message is a response to a Publish request in which the  notification Message
    //  parameter does not contain any Notifications and that contains the sequence number of the next
    //  Notification Message that is to be sent.
    const self = this;

    const subscription = self.getSubscriptionById(subscriptionId);
    /* istanbul ignore next */
    if (!subscription) {
      traceLog("send_keep_alive_response  => invalid subscriptionId = ", subscriptionId);
      return false;
    }

    if (self.pendingPublishRequestCount === 0) {
      return false;
    }

    const sequenceNumber = future_sequence_number;
    self.send_notification_message({
      subscriptionId,
      sequenceNumber,
      notificationData: [],
      moreNotifications: false
    }, false);

    return true;
  }

  _on_tick() {
    this._cancelTimeoutRequests();
  }

  _cancelTimeoutRequests() {
    const self = this;

    if (self._publish_request_queue.length === 0) {
      return;
    }

    const current_time = (new Date()).getTime(); // ms

    function timeout_filter(data) {
      const request = data.request;
      const results = data.results;
      if (!request.timeout_time) {
        // no limits
        return false;
      }
      return request.timeout_time ? request.timeout_time < current_time : false;
    }

    // filter out timeout requests
    const partition = _.partition(self._publish_request_queue, timeout_filter);

    self._publish_request_queue = partition[1]; // still valid

    const invalid_published_request = partition[0];
    invalid_published_request.forEach((publishData) => {
      console.log(" CANCELING TIMEOUT PUBLISH REQUEST ".cyan);
      const response = new subscription_service.PublishResponse({
        responseHeader: { serviceResult: StatusCodes.BadTimeout }
      });
      self.send_response_for_request(publishData, response);
    });
  }

  /**
   * @method send_notification_message
   * @param param                          {Object}
   * @param param.subscriptionId           {Number}
   * @param param.sequenceNumber           {Number}
   * @param param.notificationData         {Object}
   * @param param.availableSequenceNumbers {Array<Number>}
   * @param param.moreNotifications        {Boolean}
   * @param force                          {Boolean} push response in queue until next publish Request is received
   * @private
   */
  send_notification_message(param, force) {
    const self = this;
    assert(self.pendingPublishRequestCount > 0 || force);

    assert(!param.hasOwnProperty("availableSequenceNumbers"));
    assert(param.hasOwnProperty("subscriptionId"));
    assert(param.hasOwnProperty("sequenceNumber"));
    assert(param.hasOwnProperty("notificationData"));
    assert(param.hasOwnProperty("moreNotifications"));

    const subscription = self.getSubscriptionById(param.subscriptionId);


    const subscriptionId = param.subscriptionId;
    const sequenceNumber = param.sequenceNumber;
    const notificationData = param.notificationData;
    const moreNotifications = param.moreNotifications;

    const availableSequenceNumbers = subscription ? subscription.getAvailableSequenceNumbers() : [];

    const response = new subscription_service.PublishResponse({
      subscriptionId,
      availableSequenceNumbers,
      moreNotifications,
      notificationMessage: {
        sequenceNumber,
        publishTime: new Date(),
        notificationData
      }
    });

    if (self.pendingPublishRequestCount === 0) {
      console.log(" ---------------------------------------------------- PUSHING PUBLISH RESPONSE FOR LATE ANWSER !".bgRed.cyan);
      self._publish_response_queue.push(response);
    } else {
      const publishData = self._publish_request_queue.shift();
      self.send_response_for_request(publishData, response);
    }
  }

  _process_pending_publish_response(publishData) {
    _assertValidPublishData(publishData);
    const self = this;
    if (self._publish_response_queue.length === 0) {
      // no pending response to send
      return false;
    }
    assert(self._publish_request_queue.length === 0);
    const response = self._publish_response_queue.shift();

    self.send_response_for_request(publishData, response);
    return true;
  }

  send_response_for_request(publishData, response) {
    _assertValidPublishData(publishData);
    assert(response.responseHeader.requestHandle !== 0);

    response.results = publishData.results;
    response.responseHeader.requestHandle = publishData.request.requestHeader.requestHandle;

    publishData.callback(publishData.request, response);
  }

  /**
   * @method add_subscription
   * @param subscription  {Subscription}
   */
  add_subscription(subscription) {
    const self = this;

    assert(subscription instanceof Subscription);
    assert(_.isFinite(subscription.id));
    subscription.publishEngine = subscription.publishEngine || self;
    assert(subscription.publishEngine === self);
    assert(!self._subscriptions[subscription.id]);

    debugLog(" adding subscription with Id:", subscription.id);
    self._subscriptions[subscription.id] = subscription;

    return subscription;
  }

  detach_subscription(subscription) {
    const self = this;
    assert(subscription instanceof Subscription);
    assert(_.isFinite(subscription.id));
    assert(subscription.publishEngine === self);
    assert(self._subscriptions[subscription.id] === subscription);

    delete self._subscriptions[subscription.id];
    subscription.publishEngine = null;

    debugLog(" detaching subscription with Id:", subscription.id);
    return subscription;
  }

  /**
   * @method shutdown
   */
  shutdown() {
    const self = this;
    assert(self.subscriptionCount === 0, "subscription shall be removed first before you can shutdown a publish engine");

    // purge _publish_request_queue
    self._publish_request_queue = [];

    // purge _publish_response_queue
    self._publish_response_queue = [];

    self._closed_subscriptions = [];
  }

  on_close_subscription(subscription) {
    const self = this;
    debugLog("ServerSidePublishEngine#on_close_subscription", subscription.id);
    assert(self._subscriptions.hasOwnProperty(subscription.id));

    if (subscription.hasPendingNotifications) {
      self._closed_subscriptions.push(subscription);
    }

    delete self._subscriptions[subscription.id];

    if (self.subscriptionCount === 0) {
      while (self._feed_closed_subscription()) { }

      self.cancelPendingPublishRequest();
    }
  }

  /**
   * retrieve a subscription by id.
   * @method getSubscriptionById
   * @param subscriptionId {Integer}
   * @return {Subscription}
   */
  getSubscriptionById(subscriptionId) {
    return this._subscriptions[subscriptionId];
  }

  findSubscriptionWaitingForFirstPublish() {
    // find all subscriptions that are late and sort them by urgency
    let subscriptions_waiting_for_first_reply = _.filter(this._subscriptions, subscription => !subscription.messageSent && subscription.state === SubscriptionState.LATE);

    if (subscriptions_waiting_for_first_reply.length) {
      subscriptions_waiting_for_first_reply = _(subscriptions_waiting_for_first_reply).sortBy("timeToExpiration");
      debugLog("Some subscriptions with messageSent === false ");
      return subscriptions_waiting_for_first_reply[0];
    }
    return null;
  }

  findLateSubscriptions() {
    return _.filter(this._subscriptions, subscription => // && subscription.hasMonitoredItemNotifications;
      subscription.state === SubscriptionState.LATE && subscription.publishingEnabled);
  }

  findLateSubscriptionSortedByPriority() {
    const late_subscriptions = this.findLateSubscriptions();
    if (late_subscriptions.length === 0) {
      return null;
    }
    late_subscriptions.sort(compare_subscriptions);

    // istanbul ignore next
    if (false) {
      console.log(late_subscriptions.map(s => `[ id = ${s.id} prio=${s.priority} t=${s.timeToExpiration} ka=${s.timeToKeepAlive} m?=${s.hasMonitoredItemNotifications}]`).join(" \n"));
    }
    return late_subscriptions[late_subscriptions.length - 1];
  }

  findLateSubscriptionsSortedByAge() {
    let late_subscriptions = this.findLateSubscriptions();
    late_subscriptions = _(late_subscriptions).sortBy("timeToExpiration");

    return late_subscriptions;
  }

  static transferSubscription(subscription, destPublishEngine, sendInitialValues) {
    const self = this;
    const srcPublishEngine = subscription.publishEngine;

    console.log("ServerSidePublishEngine.transferSubscription  =<".bgWhite.red, self.pendingPublishRequestCount);
    subscription.notifyTransfer();

    destPublishEngine.add_subscription(srcPublishEngine.detach_subscription(subscription));
    subscription.resetLifeTimeCounter();
    if (sendInitialValues) {
      subscription.resendInitialValues();
    }
  }
  /**
 * get a array of subscription handled by the publish engine.
 * @property subscription {Subscription[]}
 */
  get subscriptions() {
    return _.map(this._subscriptions);
  }
  /**
   * number of pending PublishRequest available in queue
   * @property pendingPublishRequestCount
   * @type {Integer}
   */
  get pendingPublishRequestCount() {
    return this._publish_request_queue.length;
  }

  /**
   * number of subscriptions
   * @property subscriptionCount
   * @type {Integer}
   */
  get subscriptionCount() {
    return Object.keys(this._subscriptions).length;
  }

  get pendingClosedSubscriptionCount() {
    return this._closed_subscriptions.length;
  }

  get currentMonitoredItemsCount() {
    const result = _.reduce(this._subscriptions, (cumul, subscription) => cumul + subscription.monitoredItemCount, 0);
    assert(_.isFinite(result));
    return result;
  }
  get hasLateSubscriptions() {
    return this.findLateSubscriptions().length > 0;
  }
  static transferSubscriptions(srcPublishEngine, destPublishEngine) {
    const tmp = srcPublishEngine._subscriptions;
    _.forEach(tmp, (subscription) => {
      assert(subscription.publishEngine === srcPublishEngine);
      ServerSidePublishEngine.transferSubscription(subscription, destPublishEngine, false);
    });
    assert(srcPublishEngine.subscriptionCount === 0);
  }
}


function _assertValidPublishData(publishData) {
  assert(publishData.request instanceof subscription_service.PublishRequest);
  assert(_.isArray(publishData.results));
  assert(_.isFunction(publishData.callback));
}

function dummy_function() {
}

function prepare_timeout_info(request) {
  // record received time
  request.received_time = (new Date()).getTime();
  assert(request.requestHeader.timeoutHint >= 0);
  request.timeout_time = (request.requestHeader.timeoutHint > 0) ? request.received_time + request.requestHeader.timeoutHint : 0;
}


function compare_subscriptions(s1, s2) {
  if (s1.priority === s2.priority) {
    return s1.timeToExpiration < s2.timeToExpiration;
  }
  return s1.priority > s2.priority;
}


export default ServerSidePublishEngine;

