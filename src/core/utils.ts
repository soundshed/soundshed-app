export class Utils {
    static generateUUID() { // Public Domain/MIT
        //https://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid
        let d = new Date().getTime();//Timestamp
        let d2 = (performance && performance.now && (performance.now() * 1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16;//random number between 0 and 16
            if (d > 0) {//Use timestamp until depleted
                r = (d + r) % 16 | 0;
                d = Math.floor(d / 16);
            } else {//Use microseconds since page-load if supported
                r = (d2 + r) % 16 | 0;
                d2 = Math.floor(d2 / 16);
            }
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    static deepClone(val) {
        // simple way to clone a read only object
        return JSON.parse(JSON.stringify(val));
    }

    static GetXmlDocumentFromString(xmlString) {
        let xml = (new DOMParser()).parseFromString(xmlString, "text/xml");
        return xml;
    }

    static XmlToJson(xml) {
        // https://stackoverflow.com/questions/1773550/convert-xml-to-json-and-back-using-javascript

        try {
            var obj = {};
            if (xml.children.length > 0) {
                for (var i = 0; i < xml.children.length; i++) {
                    var item = xml.children.item(i);
                    var nodeName = item.nodeName;

                    if (typeof (obj[nodeName]) == "undefined") {
                        obj[nodeName] = Utils.XmlToJson(item);
                    } else {
                        if (typeof (obj[nodeName].push) == "undefined") {
                            var old = obj[nodeName];

                            obj[nodeName] = [];
                            obj[nodeName].push(old);
                        }
                        obj[nodeName].push(Utils.XmlToJson(item));
                    }
                }
            } else {
                obj = xml.textContent;
            }
            return obj;
        } catch (e) {
            console.log(e.message);
        }
    }

}