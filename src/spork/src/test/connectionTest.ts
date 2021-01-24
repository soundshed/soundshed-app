var btSerial = new (require('bluetooth-serial-port')).BluetoothSerialPort();

btSerial.on('found', function (address, name) {
    console.log("addr:" + address + " name:" + name)

    if (name == "Spark 40 Audio") {
        console.log("Connecting to spark..");
        address = "F7:EB:ED:2F:75:BA";

        btSerial.findSerialPortChannel(address, function (channel) {
            btSerial.connect(address, channel, function () {
                console.log('connected1');

                btSerial.write(Buffer.from('my data', 'utf-8'), function (err, bytesWritten) {
                    if (err) console.log(err);
                });

                btSerial.on('data', function (buffer) {
                    console.log(buffer.toString('utf-8'));
                });
            }, function () {
                console.log('cannot connect');
            });

            // close the connection when you're ready
            btSerial.close();
        }, function () {
            console.log('found nothing');
        });
    }
});


//btSerial.inquire();

function connect() {
    btSerial.connect("08:EB:ED:8F:84:0B", 2, function () {
        console.log('connected2');

        btSerial.write(Buffer.from('my data', 'utf-8'), function (err, bytesWritten) {
            if (err) console.log(err);
        });

        btSerial.on('data', function (buffer) {
            console.log(buffer.toString('utf-8'));
        });
    }, function () {
        console.log('cannot connect');
    });

    // close the connection when you're ready
    btSerial.close();

    /*btSerial.findSerialPortChannel("F7:EB:ED:2F:75:BA", (ch) => {
        console.log("Found:" + ch);

    },(err)=>{
        console.log('Could not find serial channel..' + err);

    })*/
    /*for(var i=1; i<255;i++)
    {
        btSerial.connect("F7:EB:ED:2F:75:BA", i, () => {

            // connected
            console.log('Connected..'+i);

        }, (err) => {

            console.log(i+'Err..' + err);
        });

        
    }*/
}

connect();