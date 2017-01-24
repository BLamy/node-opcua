
/**
 * @module opcua.address_space
 */

import util from "util";

import assert from "better-assert";
import _ from "underscore";
import { NodeId } from "lib/datamodel/nodeid";
import { DataType } from "lib/datamodel/variant";
import { Variant } from "lib/datamodel/variant";
import { coerceLocalizedText } from "lib/datamodel/localized_text";
import { StatusCodes } from "lib/datamodel/opcua_status_code";
import { AttributeIds } from "lib/services/read_service";
import { UAObjectType } from "lib/address_space/ua_object_type";
import { UAObject } from "lib/address_space/ua_object";
import { BaseNode } from "lib/address_space/base_node";

const doDebug = false;

/*
 *
 * @class UAStateMachine
 * @constructor
 * @extends UAObject
 * UAStateMachine.initialState as Node
 *
 */
class UAStateMachine extends UAObject {
  _post_initialize() {
    const self = this;
    const addressSpace = self.addressSpace;
    const finiteStateMachineType = addressSpace.findObjectType("FiniteStateMachineType");
    assert(finiteStateMachineType.browseName.toString() === "FiniteStateMachineType");

    assert(self.typeDefinitionObj && !self.subtypeOfObj);
    assert(!self.typeDefinitionObj || self.typeDefinitionObj.isSupertypeOf(finiteStateMachineType));
      // get current Status

    const d = self.currentState.readValue();

    if (d.statusCode !== StatusCodes.Good) {
      self.setState(null);
    } else {
      self.currentStateNode = self.getStateByName(d.value.value.text.toString());
    }
  }

  /**
   * @method getStates
   * @returns {*}
   */
  getStates() {
    const self = this;
    const addressSpace = self.addressSpace;

    const initialStateType = addressSpace.findObjectType("InitialStateType");
    const stateType        = addressSpace.findObjectType("StateType");

    assert(initialStateType.isSupertypeOf(stateType));

    const typeDef = self.typeDefinitionObj;
      
    let comp = getComponentFromTypeAndSubtype(typeDef);

    comp = comp.filter((c) => {
      if (!(c.typeDefinitionObj instanceof UAObjectType)) {
        return false;
      }
      return c.typeDefinitionObj.isSupertypeOf(stateType);
    });

    return comp;
  }

  /**
   * @method getStateByName
   * @param name  {string}
   * @returns {null|UAObject}
   */
  getStateByName(name) {
    const self = this;
    let states = self.getStates();
    states = states.filter(s => s.browseName.name === name);
    assert(states.length <= 1);
    return states.length === 1 ? states[0] : null;
  }

  getTransitions() {
    const self = this;
    const addressSpace = self.addressSpace;

    const transitionType = addressSpace.findObjectType("TransitionType");
    const typeDef = self.typeDefinitionObj;

    let comp = getComponentFromTypeAndSubtype(typeDef);

    comp = comp.filter((c) => {
      if (!(c.typeDefinitionObj instanceof UAObjectType)) {
        return false;
      }
      return c.typeDefinitionObj.isSupertypeOf(transitionType);
    });

    return comp;
  }

  _coerceNode(node) {
    if (node == null) {
      return null;
    }
    const self = this;
    const addressSpace = self.addressSpace;
    let retValue = node;
    if (node instanceof BaseNode) {
      return node;
    } else if (node instanceof NodeId) {
      retValue = addressSpace.findNode(node);
    } else if (_.isString(node)) {
      retValue  = self.getStateByName(node);
    }
    if (!retValue) {
      console.log(" cannot find component with ",node ? node.toString() : "null");
    }
    return retValue;
  }

  /**
   * @method isValidTransition
   * @param toStateNode
   * @returns {boolean}
   */
  isValidTransition(toStateNode) {
    assert(toStateNode);
      // is it legal to go from state currentState to toStateNode;
    const self = this;
    if (!self.currentStateNode) {
      return true;
    }
    const n = self.currentState.readValue();

      // to be executed there must be a transition from currentState to toState
    const transition = self.findTransitionNode(self.currentStateNode,toStateNode);
    if (!transition) {
          // istanbul ignore next
      if (doDebug) {
        console.log(" No transition from ",self.currentStateNode.browseName.toString(), " to " , toStateNode.toString());
      }
      return false;
    }
    return true;
  }

  /**
   * @method findTransitionNode
   * @param fromStateNode {NodeId|BaseNode|string}
   * @param toStateNode   {NodeId|BaseNode|string}
   * @returns {UAObject}
   */
  findTransitionNode(fromStateNode, toStateNode) {
    const self = this;
    const addressSpace = self.addressSpace;

    fromStateNode = self._coerceNode(fromStateNode);
    if (!fromStateNode) { return null; }

    toStateNode = self._coerceNode(toStateNode);

    assert(fromStateNode instanceof UAObject);
    assert(toStateNode   instanceof UAObject);

    const stateType = addressSpace.findObjectType("StateType");

    assert(fromStateNode.typeDefinitionObj.isSupertypeOf(stateType));
    assert(toStateNode.typeDefinitionObj.isSupertypeOf(stateType));

    let transitions = fromStateNode.findReferencesAsObject("FromState",false);

    transitions = transitions.filter((transition) => {
      assert(transition.toStateNode instanceof UAObject);
      return transition.toStateNode === toStateNode;
    });
    if (transitions.length === 0) {
          // cannot find a transition from fromState to toState
      return null;
    }
    assert(transitions.length === 1);
    return transitions[0];
  }

  /**
   * @method getCurrentState
   * @return {String}
   */
  getCurrentState() {
      // xx self.currentState.readValue().value.value.text
      // xx self.shelvingState.currentStateNode.browseName.toString()
    const self = this;
    if (!self.currentStateNode) {
      return null;
    }
    return self.currentStateNode.browseName.toString();
  }

  /**
   * @method setState
   * @param toStateNode {String|false|UAObject}
   */
  setState(toStateNode) {
    const self = this;

    if (!toStateNode) {
      self.currentStateNode = null;
      self.currentState.setValueFromSource({ dataType: DataType.Null },StatusCodes.BadStateNotActive);
      return;
    }
    if (_.isString(toStateNode))  {
      const state = self.getStateByName(toStateNode);
          // istanbul ignore next
      if (!state) {
        throw new Error(`Cannot find state with name ${toStateNode}`);
      }
      assert(state.browseName.toString() === toStateNode);
      toStateNode = state;
    }
    const fromStateNode = self.currentStateNode;

    toStateNode = self._coerceNode(toStateNode);
    assert(toStateNode instanceof UAObject);

    self.currentState.setValueFromSource({
      dataType: DataType.LocalizedText,
      value: coerceLocalizedText(toStateNode.browseName.toString())
    },StatusCodes.Good);

    self.currentStateNode = toStateNode;

    const transitionNode = self.findTransitionNode(fromStateNode,toStateNode);

    if (transitionNode) {
          // xx console.log("transitionNode ",transitionNode.toString());
          // The inherited Property SourceNode shall be filled with the NodeId of the StateMachine instance where the
          // Transition occurs. If the Transition occurs in a SubStateMachine, then the NodeId of the SubStateMachine
          // has to be used. If the Transition occurs between a StateMachine and a SubStateMachine, then the NodeId of
          // the StateMachine has to be used, independent of the direction of the Transition.
          // Transition identifies the Transition that triggered the Event.
          // FromState identifies the State before the Transition.
          // ToState identifies the State after the Transition.
      self.raiseEvent("TransitionEventType",{

              // Base EventType
              // xx nodeId:      self.nodeId,
              // TransitionEventType
              // TransitionVariableType
        transition:    { dataType: "LocalizedText", value: transitionNode.displayName },
        "transition.id": transitionNode.transitionNumber.readValue().value,

        fromState:     { dataType: "LocalizedText", value: fromStateNode.displayName },   // StateVariableType
        "fromState.id": fromStateNode.stateNumber.readValue().value,

        toState:       { dataType: "LocalizedText", value: toStateNode.displayName   },    // StateVariableType
        "toState.id":    toStateNode.stateNumber.readValue().value
      });
    } else if (fromStateNode && fromStateNode !== toStateNode) {
      if (doDebug)  {
        const f = fromStateNode.browseName.toString();
        const t = toStateNode.browseName.toString();
        console.log("Warning".red, ` cannot raise event :  transition ${f} to ${t} is missing`);
      }
    }

      // also update executable flags on methods

    self.getMethods().forEach((method) => {
      method._notifyAttributeChange(AttributeIds.Executable);
    });
  }
}


UAStateMachine.promote = (node) => {
  if (node instanceof UAStateMachine) {
    return node; // already promoted
  }
  Object.setPrototypeOf(node,UAStateMachine.prototype);
  node._post_initialize();
  return node;
};


function getComponentFromTypeAndSubtype(typeDef) {
  const components_parts = [];
  components_parts.push(typeDef.getComponents());

  while (typeDef.subtypeOfObj) {
    typeDef = typeDef.subtypeOfObj;
    components_parts.push(typeDef.getComponents());
  }
  return [].concat(...components_parts);
}

UAStateMachine.prototype.__defineGetter__("states",function () {
  return this.getStates();
});

UAStateMachine.prototype.__defineGetter__("transitions",function () {
  return this.getTransitions();
});

/**
 * return the node InitialStateType
 * @property initialState
 * @type  {UAObject}
 */
UAStateMachine.prototype.__defineGetter__("initialState", function () {
  const self = this;
  const addressSpace = self.addressSpace;

  const initialStateType = addressSpace.findObjectType("InitialStateType");
  const typeDef = self.typeDefinitionObj;

  let comp = getComponentFromTypeAndSubtype(typeDef);

  comp = comp.filter(c => c.typeDefinitionObj === initialStateType);

    // istanbul ignore next
  if (comp.length > 1) {
    throw new Error(" More than 1 initial state in stateMachine");
  }
  return comp.length === 0 ?  null : comp[0];
});


UAObject.prototype.__defineGetter__("toStateNode",function () {
  const self = this;
  const nodes = self.findReferencesAsObject("ToState",true);
  assert(nodes.length <= 1);
  return nodes.length === 1 ? nodes[0] : null;
});

UAObject.prototype.__defineGetter__("fromStateNode",function () {
  const self = this;
  const nodes = self.findReferencesAsObject("FromState",true);
  assert(nodes.length <= 1);
  return nodes.length === 1 ? nodes[0] : null;
});

UAStateMachine.prototype.__defineGetter__("currentStateNode",function () {
  const self = this;
  return self._currentStateNode;
});

/**
 * @property currentStateNode
 * @type BaseNode
 */
UAStateMachine.prototype.__defineSetter__("currentStateNode",function (value) {
  const self = this;
  return self._currentStateNode = value;
});


export default UAStateMachine;
