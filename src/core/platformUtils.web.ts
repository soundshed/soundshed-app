const openLink = (e, linkUrl) => {
  e.preventDefault();
  // open link...
};

interface CustomEvent {
  type: string;
  action: (event, args) => void;
}

class PlatformEvents {

  private evtListeners: CustomEvent[] = [];

  invoke(type: string, data: any): Promise<any> {
    return new Promise(res => {    
      var e = this.evtListeners.find(f => f.type == type);
      if (e != null) {
        console.log("invoking action type:" + type);
        e.action(type, data);
      } else {
        console.log("cannot invoke action type, no event listener:" + type);
      }
      res(true);
    });
  }

  on(type: string, action: (event, args) => void) {
    console.log("on type:" + type);
    evt.evtListeners.push({ type: type, action: action });
  }
};

const evt: PlatformEvents = new PlatformEvents();

export { openLink, evt as platformEvents };