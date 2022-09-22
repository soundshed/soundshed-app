
import { openLink, nativeEvents, getAppVersion } from "./platformUtils.electron"; // electron

//import {openLink,platformEvents, getAppVersion} from "./platformUtils.web"; // web

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
          console.info("invoking action type:" + type);
          e.action(type, data);
        } else {
          console.warn("cannot invoke action type, no event listener:" + type);
        }
        res(true);
      });
    }

    on(type: string, action: (event, args) => void) {
      evt.evtListeners.push({ type: type, action: action });
    }

    sendSync(type:string,value:string){
      console.debug("sendsync:" + type);
    }
  };

  const evt: PlatformEvents = new PlatformEvents();


export { openLink, evt as platformEvents , nativeEvents, getAppVersion};
