import { GMMK } from './devices'
import { delay } from './utils'

const main = async (): Promise<number> => {
  let exitCode = 1
  let driver: GMMK | undefined

  try {
    driver = new GMMK()
    await driver.setBrightness(0);
    await delay(500);
    await driver.setBrightness(1);
    await delay(500);
    await driver.setBrightness(2);
    await delay(500);
    await driver.setBrightness(3);

    for (let i = 0; i < 19; i++) {
      await delay(1000);
      await driver.setLEDMode(i);
    }
  } catch (error) {
    console.log((error as Error).message)
    exitCode = -1
  } finally {
    if (driver) {
      driver.release()
    }
    return exitCode
  }

}

main().then((exitCode) => process.exit(exitCode))
