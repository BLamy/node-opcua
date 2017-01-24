import assert from "better-assert";
import os from "os";
import { 
  Variant,
  DataType } from "lib/datamodel/variant";
import ServerEngine from "lib/server/ServerEngine";
import { ObjectIds } from "lib/opcua_node_ids";
import { StatusCodes } from "lib/datamodel/opcua_status_code";

import humanize from "humanize"; 

require("requirish")._(module);

/**
 * @method addVariableWithHumanizeText
 * @param engine
 * @param options
 * @param options.browseName
 * @private
 */
function addVariableWithHumanizeText(engine, options) {
  assert(options.componentOf || options.organizedBy);

  const variable = engine.addressSpace.addVariable(options);

    // add the xxxAsText property
  engine.addressSpace.addVariable({

    propertyOf: variable,

    browseName: `${options.browseName.toString()}AsText`,
    description: `${options.description} as text`,
    dataType: "String",
    minimumSamplingInterval: options.minimumSamplingInterval,
    value: {
      get() {
        const v = options.value.get();
        if (v instanceof Variant) {
          return new Variant({ dataType: DataType.String, value: humanize.filesize(v.value) });
        } 
        return v;
      }
    }
  });
}

/**
 *
 * optionally install a CPU Usage and Memory Usage node
 * ( condition : running on linux and require("usage")
 * @method installOptionalCpuAndMemoryUsageNode
 * @param server {OPCUAServer}
 *
 */
function installOptionalCpuAndMemoryUsageNode(server) {
  const engine = server.engine;
  assert(engine instanceof ServerEngine);

  let usage;
  try {
    usage = require("usage");
  } catch (err) {
    console.log("err", err.message);
    usage = null;
        // xx return;
  }

  const folder = engine.addressSpace.findNode(ObjectIds.Server_VendorServerInfo);

  let usage_result = { memory: 0, cpu: 100 };

  const pid = process.pid;
  
  if (usage) {
    const options = { keepHistory: true };
    setInterval(() => {
      usage.lookup(pid, options, (err, result) => {
        usage_result = result;
        console.log("result Used Memory: ", humanize.filesize(result.memory), " CPU ", Math.round(result.cpu), " %");
        if (err) { console.log("err ",err); }
      });
    }, 1000);

    engine.addressSpace.addVariable({

      organizedBy: folder,

      browseName:    "CPUUsage",
      description:   "Current CPU usage of the server process",
      nodeId:        "ns=2;s=CPUUsage",
      dataType:      "Double",
      minimumSamplingInterval: 1000,
      value: {
        get() {
          if (!usage_result) {
            return StatusCodes.BadResourceUnavailable;
          }
          return new Variant({ dataType: DataType.Double, value: Math.round(usage_result.cpu, 2) });
        }
      }
    });


    addVariableWithHumanizeText(engine,{
      organizedBy: folder,
      browseName:  "MemoryUsage",
      nodeId:      "ns=2;s=MemoryUsage",
      description: "Current memory usage of the server process",
      dataType:    "Number",
      minimumSamplingInterval: 1000,
      value: {
        get() {
          if (!usage_result) {
            return StatusCodes.BadResourceUnavailable;
          }
          return new Variant({ dataType: DataType.UInt32, value: usage_result.memory });
        }
      }
    });
  } else {
    console.log("skipping installation of cpu_usage and memory_usage nodes");
  }

  engine.addressSpace.addVariable({
    organizedBy: folder,

    browseName: "PercentageMemoryUsed",
    description: "% of  memory used by the server",
    nodeId: "ns=2;s=PercentageMemoryUsed",
    dataType: "Number",
    minimumSamplingInterval: 1000,
    value: {
      get() {
        const percent_used = Math.round((os.totalmem() - os.freemem()) / os.totalmem() * 100);
        return new Variant({ dataType: DataType.Double, value: percent_used });
      }
    }
  });

  addVariableWithHumanizeText(engine, {
    organizedBy: folder,
    browseName: "SystemMemoryTotal",
    description: "Total Memory usage of the server",
    nodeId: "ns=2;s=SystemMemoryTotal",
    dataType: "Number",
    accessLevel: "CurrentRead",
    minimumSamplingInterval: 1000,
    value: {
      get() {
        const memory = os.totalmem();
        return new Variant({ dataType: DataType.UInt64, value: memory });
      }
    }
  });

  addVariableWithHumanizeText(engine,{
    organizedBy: folder,
    browseName: "SystemMemoryFree",
    description: "Free Memory usage of the server in MB",
    nodeId: "ns=2;s=SystemMemoryFree",
    dataType: "Number",
    accessLevel: "CurrentRead",
    minimumSamplingInterval: 1000,
    value: {
      get() {
        const memory = os.freemem();
        return new Variant({ dataType: DataType.UInt64, value: memory });
      }
    }
  });

  engine.addressSpace.addVariable({
    organizedBy: folder,
    browseName: "NumberOfCPUs",
    description: "Number of cpus on the server",
    nodeId: "ns=2;s=NumberOfCPUs",
    dataType: "Number",
    accessLevel: "CurrentRead",
    minimumSamplingInterval: 1000,
    value: {
      get() {
        return new Variant({ dataType: DataType.UInt32, value: os.cpus().length });
      }
    }
  });

  engine.addressSpace.addVariable({
    organizedBy: folder,
    browseName: "Arch",
    description: "ServerArchitecture",
    nodeId: "ns=2;s=ServerArchitecture",
    dataType: "String",
    accessLevel: "CurrentRead",
    minimumSamplingInterval: 1000,
    value: {
      get() {
        return new Variant({ dataType: DataType.String, value: os.type() });
      }
    }
  });

  addVariableWithHumanizeText(engine,{
    organizedBy: folder,
    browseName: "BytesWritten",
    description: "number of bytes written by the server",
    nodeId: "ns=2;s=BytesWritten",
    dataType: "Number",
    accessLevel: "CurrentRead",
    minimumSamplingInterval: 1000,
    value: {
      get() {
        return new Variant({ dataType: DataType.UInt64, value: server.bytesWritten });
      }
    }
  });

  addVariableWithHumanizeText(engine,  {
    organizedBy: folder,
    browseName: "BytesRead",
    description: "number of bytes read by the server",
    nodeId: "ns=2;s=BytesRead",
    dataType: "Number",
    accessLevel: "CurrentRead",
    minimumSamplingInterval: 1000,
    value: {
      get() {
        return new Variant({ dataType: DataType.UInt64, value: server.bytesRead });
      }
    }
  });

  engine.addressSpace.addVariable({
    organizedBy: folder,
    browseName: "TransactionsCount",
    description: "total number of transactions performed the server",
    nodeId: "ns=2;s=TransactionsCount",
    dataType: "Number",
    accessLevel: "CurrentRead",
    minimumSamplingInterval: 1000,
    value: {
      get() {
        return new Variant({ dataType: DataType.UInt32, value: server.transactionsCount });
      }
    }
  });

  engine.addressSpace.addVariable({
    organizedBy: folder,
    browseName: "ConnectionsCount",
    description: "number of active Connections",
    nodeId: "ns=2;s=ConnectionCount",
    dataType: "String",
    accessLevel: "CurrentRead",
    minimumSamplingInterval: 1000,
    value: {
      get() {
        return new Variant({ dataType: DataType.String, value: humanize.filesize(server.currentChannelCount) });
      }
    }
  });
}

export { installOptionalCpuAndMemoryUsageNode };
