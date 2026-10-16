// The amp exposes four hardware preset slots (0-3) plus a virtual channel that a
// tone can be pushed to without overwriting anything stored on the device.
//
// Anything applied from the tone browser lands here, so code that wants to read
// back "what is the amp playing right now" after applying a tone must query this
// channel rather than hardware slot 0.
export const VIRTUAL_CHANNEL = 0x7f;
