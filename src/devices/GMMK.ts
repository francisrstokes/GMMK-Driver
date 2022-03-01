import * as usb from 'usb';
import { Device } from 'usb/dist/usb';
import { Endpoint } from 'usb/dist/usb/endpoint';
import { Interface } from 'usb/dist/usb/interface';

const VID = 0x0c45;
const PID = 0x652f;

const COMMAND_ENDPOINT = 0x03;
const INTERRUPT_ENDPOINT = 0x82;

const TIMEOUT = 1000;
export class GMMK {
  device: Device;
  commandEp: Endpoint;
  interruptEp: Endpoint;
  iFace: Interface;

  hasDetachedKernelDriver = false;

  constructor() {
    this.device = usb.findByIds(VID, PID);
    if (!this.device) {
      throw new Error('GMMK Device Not Found')
    }
    this.device.open();

    this.iFace = this.device.interfaces[1];
    if (this.iFace.isKernelDriverActive()) {
      this.hasDetachedKernelDriver = true;
      this.iFace.detachKernelDriver();
    }
    this.iFace.claim();

    this.commandEp = this.iFace.endpoints.find(e => e.address === COMMAND_ENDPOINT);
    this.interruptEp = this.iFace.endpoints.find(e => e.address === INTERRUPT_ENDPOINT);
  }

  async commandTransfer(data: Buffer): Promise<Buffer> {
    type TransferCb = Parameters<typeof this.commandEp.makeTransfer>[1];
    return new Promise((resolve, reject) => {
      const cb: TransferCb = (err, data, length) => {
        if (err) {
          return reject(err);
        }
        return resolve(data.slice(0, length));
      };

      const transfer = this.commandEp.makeTransfer(TIMEOUT, cb);
      transfer.submit(data, cb);
    });
  }

  async interruptTransfer(data: Buffer): Promise<Buffer> {
    type TransferCb = Parameters<typeof this.commandEp.makeTransfer>[1];
    return new Promise((resolve, reject) => {
      const cb: TransferCb = (err, data, length) => {
        if (err) {
          return reject(err);
        }
        return resolve(data.slice(0, length));
      };

      const transfer = this.interruptEp.makeTransfer(TIMEOUT, cb);
      transfer.submit(data, cb);
    });
  }

  async setBrightness(level: number): Promise<void> {
    let transferBuffer = Buffer.alloc(64);
    let rxBuffer = Buffer.alloc(64);

    // Header
    transferBuffer[0] = 0x04;
    transferBuffer[1] = 0x01;
    transferBuffer[2] = 0x00;
    transferBuffer[3] = 0x01;
    await this.commandTransfer(transferBuffer);
    await this.interruptTransfer(rxBuffer);

    // Actual request
    transferBuffer[0] = 0x04;
    transferBuffer[1] = 0x08 + level;
    transferBuffer[2] = 0x00;
    transferBuffer[3] = 0x06;
    transferBuffer[4] = 0x01;
    transferBuffer[5] = 0x01;
    transferBuffer[6] = 0x00;
    transferBuffer[7] = 0x00;
    transferBuffer[8] = level;
    await this.commandTransfer(transferBuffer);
    await this.interruptTransfer(rxBuffer);

    // Footer
    rxBuffer = Buffer.alloc(64);
    transferBuffer[0] = 0x04;
    transferBuffer[1] = 0x02;
    transferBuffer[2] = 0x00;
    transferBuffer[3] = 0x02;
    await this.commandTransfer(transferBuffer);
    await this.interruptTransfer(rxBuffer);
  }

  async setLEDMode(mode: number): Promise<void> {
    let transferBuffer = Buffer.alloc(64);
    let rxBuffer = Buffer.alloc(64);

    // Header
    transferBuffer[0] = 0x04;
    transferBuffer[1] = 0x01;
    transferBuffer[2] = 0x00;
    transferBuffer[3] = 0x01;
    await this.commandTransfer(transferBuffer);
    await this.interruptTransfer(rxBuffer);

    // Actual request
    // 04 0c 00 06 01 04 00 00 01
    transferBuffer[0] = 0x04;
    transferBuffer[1] = 0x0c;
    transferBuffer[2] = 0x00;
    transferBuffer[3] = 0x06;
    transferBuffer[4] = 0x01;
    transferBuffer[5] = 0x04;
    transferBuffer[6] = 0x00;
    transferBuffer[7] = 0x00;
    transferBuffer[8] = mode + 1;
    await this.commandTransfer(transferBuffer);
    await this.interruptTransfer(rxBuffer);

    // Footer
    transferBuffer = Buffer.alloc(64);
    transferBuffer[0] = 0x04;
    transferBuffer[1] = 0x02;
    transferBuffer[2] = 0x00;
    transferBuffer[3] = 0x02;
    await this.commandTransfer(transferBuffer);
    await this.interruptTransfer(rxBuffer);
  }

  release() {
    this.iFace.release();
    if (this.hasDetachedKernelDriver) {
      this.iFace.attachKernelDriver();
    }
  }
}
