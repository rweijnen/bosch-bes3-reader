(function () {
const MessageType = {
  READ: 0,
  READ_RESPONSE: 1,
  WRITE: 2,
  WRITE_RESPONSE: 3,
  RPC: 4,
  RPC_RESPONSE: 5,
};
const Direction = {
  OUTBOUND: 'outbound',
  BIKE_ORIGINATED_STARTUP: 'bike-originated-startup',
  MOBILE_APP_RESPONSE: 'mobile-app-response',
};

const Channel = {
  COMMAND: 0,
  MESSAGE_BUS: 1,
};

const CommandType = {
  VERSION: 0x01,
  ADVANCE_TRANSMIT_WINDOW: 0x02,
  DISABLE_FLOW_CONTROL: 0x03,
  MAX_SEGMENTATION_PACKET: 0x04,
};

const MOBILE_APP_ADDRESSES = {
  STARTUP_STAGE: 0x40a9,
  MOBILE_APP_STATIC_FEATURE_PROPERTIES: 0x40aa,
};

const ALLOWED_READ_ADDRESSES = new Set([
  0x1817, // DriveUnit.MAXIMUM_ASSISTANCE_SPEED
  0x1842, // DriveUnit.MAXIMUM_ASSISTANCE_SPEED_IBD
  0x187d,
  0x181e, // DriveUnit.PRESENT_ASSIST_FACTOR, minimal ephemeral current-assist check
]);

const ALLOWED_COMMAND_TYPES = new Set([
  CommandType.VERSION,
  CommandType.DISABLE_FLOW_CONTROL,
  CommandType.MAX_SEGMENTATION_PACKET,
]);

function addressFromBytes(high, low) {
  return ((high & 0x7f) << 8) | low;
}

function messageTypeFromBody(body) {
  if (!body || body.length < 5) return null;
  return (body[4] >> 4) & 0x0f;
}

function destinationAddressFromBody(body) {
  if (!body || body.length < 4) return null;
  return addressFromBytes(body[2], body[3]);
}

function isAllowedBleValidationCommand(payload) {
  return !!payload && payload.length >= 1 && ALLOWED_COMMAND_TYPES.has(payload[0]);
}

function isAllowedOutboundBleValidationMessageBusBody(body) {
  const type = messageTypeFromBody(body);
  const destination = destinationAddressFromBody(body);
  if (type === null || destination === null) return false;

  if (type === MessageType.READ) {
    return ALLOWED_READ_ADDRESSES.has(destination);
  }

  return false;
}

function isAllowedBikeOriginatedStartupRequest(body) {
  const type = messageTypeFromBody(body);
  const destination = destinationAddressFromBody(body);
  if (type === null || destination === null) return false;
  return (type === MessageType.READ && destination === MOBILE_APP_ADDRESSES.MOBILE_APP_STATIC_FEATURE_PROPERTIES) ||
    (type === MessageType.WRITE && destination === MOBILE_APP_ADDRESSES.STARTUP_STAGE);
}

function isAllowedMobileAppStartupResponse(body) {
  const type = messageTypeFromBody(body);
  if (type === null) return false;
  const source = addressFromBytes(body[0], body[1]);
  return (type === MessageType.READ_RESPONSE && source === MOBILE_APP_ADDRESSES.MOBILE_APP_STATIC_FEATURE_PROPERTIES) ||
    (type === MessageType.WRITE_RESPONSE && source === MOBILE_APP_ADDRESSES.STARTUP_STAGE);
}

function isAllowedBleValidationOperation(operation) {
  if (!operation || typeof operation !== 'object') return false;
  const direction = operation.direction || Direction.OUTBOUND;

  if (direction === Direction.BIKE_ORIGINATED_STARTUP) {
    return operation.channel === Channel.MESSAGE_BUS && !!operation.body && isAllowedBikeOriginatedStartupRequest(operation.body);
  }
  if (direction === Direction.MOBILE_APP_RESPONSE) {
    return operation.channel === Channel.MESSAGE_BUS && !!operation.body && isAllowedMobileAppStartupResponse(operation.body);
  }
  if (direction !== Direction.OUTBOUND) return false;

  if (operation.channel === Channel.COMMAND) {
    return isAllowedBleValidationCommand(operation.payload);
  }
  if (operation.channel !== Channel.MESSAGE_BUS) return false;
  if (operation.body) return isAllowedOutboundBleValidationMessageBusBody(operation.body);
  if (operation.messageType === MessageType.READ) return ALLOWED_READ_ADDRESSES.has(operation.address);
  return false;
}

const allowlistExports = {
  MessageType,
  Direction,
  Channel,
  CommandType,
  MOBILE_APP_ADDRESSES,
  ALLOWED_READ_ADDRESSES,
  isAllowedBleValidationCommand,
  isAllowedOutboundBleValidationMessageBusBody,
  isAllowedBikeOriginatedStartupRequest,
  isAllowedMobileAppStartupResponse,
  isAllowedBleValidationOperation,
  addressFromBytes,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = allowlistExports;
} else if (typeof window !== 'undefined') {
  window.Bes3BleValidationAllowlist = allowlistExports;
}
})();
