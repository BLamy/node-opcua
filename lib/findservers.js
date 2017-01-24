import OPCUAClientBase from "lib/client/OPCUAClientBase";
/**
 * extract the server endpoints exposed by a discovery server
 * @method perform_findServersRequest
 * @async
 * @param discovery_server_endpointUrl
 * @param callback
 */
function perform_findServersRequest(discovery_server_endpointUrl, callback) {
  const client = new OPCUAClientBase();

  client.connect(discovery_server_endpointUrl, (err) => {
    if (!err) {
      client.findServers((err, servers) => {
        client.disconnect(() => {
          callback(err, servers);
        });
      });
    } else {
      client.disconnect(() => {
        callback(err);
      });
    }
  });
}
export { perform_findServersRequest };
