const React = require('react');
const { View } = require('react-native');

const Swipeable = React.forwardRef(({ children, renderRightActions, renderLeftActions, testID, ...props }, ref) => {
  React.useImperativeHandle(ref, () => ({
    close: jest.fn(),
    openLeft: jest.fn(),
    openRight: jest.fn(),
    reset: jest.fn(),
  }));

  return React.createElement(
    View,
    { testID, ...props },
    children,
    renderRightActions ? renderRightActions(null, null) : null,
    renderLeftActions ? renderLeftActions(null, null) : null
  );
});

Swipeable.displayName = 'Swipeable';

module.exports = Swipeable;
module.exports.default = Swipeable;
