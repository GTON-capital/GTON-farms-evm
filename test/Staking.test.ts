import { waffle } from "hardhat"
import { expect } from "chai"
import { BigNumber, BigNumberish, constants, Contract, Wallet } from 'ethers'
import { stakingFixture } from "./utilities/fixtures"
import { mineBlocks, setTimestamp, expandTo18Decimals, time } from "./utilities/index"

import { ERC20 } from "../types/ERC20"
import { Staking } from "../types/Staking"


describe("Staking", () => {
    const [wallet, admin0, admin1, alice, bob, denice, fedor, other] = waffle.provider.getWallets()

    let loadFixture: ReturnType<typeof waffle.createFixtureLoader>

    before("create fixture loader", async () => {
        loadFixture = waffle.createFixtureLoader([wallet, admin0, admin1, other], waffle.provider)
    })

    let gton: ERC20
    let staking: Staking
    beforeEach("deploy test contracts", async () => {
        ; ({
            gton,
            staking,
        } = await loadFixture(stakingFixture))

    })

    const calcDecimals = BigNumber.from('100000000000000'); // 1e14

    async function fillUpStaking() {
        const fedorValue = BigNumber.from("974426000000")
        const deniceValue = BigNumber.from("1000000")
        const bobValue = BigNumber.from("6000000000000000000000000")

        await gton.transfer(denice.address, deniceValue)
        await gton.connect(denice).approve(staking.address, deniceValue)
        await staking.connect(denice).stake(deniceValue, denice.address)

        await gton.transfer(fedor.address, fedorValue)
        await gton.connect(fedor).approve(staking.address, fedorValue)
        await staking.connect(fedor).stake(fedorValue, fedor.address)

        await gton.transfer(bob.address, bobValue)
        await gton.connect(bob).approve(staking.address, bobValue)
        await staking.connect(bob).stake(bobValue, bob.address)
    }

    it("constructor initializes variables", async () => {
        const lastBlock = (await waffle.provider.getBlock("latest")).timestamp
        expect(await staking.admin()).to.eq(wallet.address)
        expect(await staking.amountStaked()).to.eq(0)
        expect(await staking.harvestInterval()).to.eq(86400)
        expect(await staking.decimals()).to.eq(await gton.decimals())
        expect(await staking.aprBasisPoints()).to.eq(2500)
    })

    it("update admin", async () => {
        await expect(staking.connect(other).updateAdmin(wallet.address)).to.be.revertedWith('Staking: permitted to admin only.')
        await staking.updateAdmin(other.address)
        expect(await staking.admin()).to.eq(other.address)
    })

    /*
    it("set APR", async () => {
        // random numbers
        const apr = BigNumber.from("140")
        await expect(staking.connect(other).setApr(apr)).to.be.revertedWith('Staking: permitted to admin only.')
        await staking.setApr(apr)
        expect(await staking.aprBasisPoints()).to.eq(apr)
    })
    */

    it("withdraw token", async () => {
        const amount = BigNumber.from(15000000000000)
        gton.transfer(staking.address, amount)
        await expect(staking.connect(other).withdrawToken(gton.address, wallet.address, amount)).to.be.revertedWith('Staking: permitted to admin only')
        // expect admin to fail to withdraw
        await expect(staking.connect(admin0).withdrawToken(gton.address, wallet.address, amount)).to.be.revertedWith('Staking: permitted to admin only')
        await staking.withdrawToken(gton.address, other.address, amount)
        expect(await gton.balanceOf(other.address)).to.eq(amount)
        expect(await gton.balanceOf(staking.address)).to.eq(0)
        await expect(staking.withdrawToken(gton.address, other.address, amount.add(1))).to.be.reverted
    })
    const updRewardData = [
        {
            period: 100,
            apr: BigNumber.from("1200"),
            amount: expandTo18Decimals(150),
            user: bob,
        },
        {
            period: 1000,
            apr: BigNumber.from("7500"),
            amount: expandTo18Decimals(897),
            user: alice,
        },
        {
            period: 5000,
            apr: BigNumber.from("900"),
            amount: expandTo18Decimals(54000),
            user: other,
        },
    ]

    /*
    it("update reward pool", async () => {
        for (const item of updRewardData) {
            await staking.setApr(item.apr);
            const prevAccRewardPerShare = await staking.accumulatedRewardPerShare();
            const lastChangeTS = await staking.lastRewardTimestamp();
            await setTimestamp(waffle.provider, lastChangeTS.add(time.day).toNumber())
            await staking.updateRewardPool()
            const delta = (await staking.lastRewardTimestamp()).sub(lastChangeTS)
            const aprDenominator = await staking.aprDenominator();
            const staked = calcDecimals.mul(delta).mul(item.apr).div(aprDenominator).div(time.year)

            expect(await staking.accumulatedRewardPerShare()).to.eq(prevAccRewardPerShare.add(staked))
            expect(await staking.lastRewardTimestamp()).to.eq(lastChangeTS.add(time.day).add(1))
        }

        await staking.togglePause();
        await expect(staking.updateRewardPool()).to.be.revertedWith("Staking: contract paused.")
        await staking.togglePause();
    })
    */

    async function calculateReward(startingFromTS: BigNumberish, amount: BigNumberish, sec: number = 1) {
        const apr = await staking.aprBasisPoints();
        const aprDenominator = await staking.aprDenominator();
        const currentBlockTS = (await waffle.provider.getBlock("latest")).timestamp
        const initialTS = BigNumber.from(currentBlockTS)
        const delta = initialTS.add(sec).sub(startingFromTS)
        return delta.mul(apr).div(aprDenominator).div(time.year)
        // return calcDecimals.mul(delta).mul(apr).div(aprDenominator).div(time.year)
    }

    async function stake(forUser: string, amount: BigNumberish) {
        const beforeAmountStaked = await staking.amountStaked()
        const beforeState = await staking.userInfo(forUser);
        const beforeAmount = beforeState.amount
        await gton.approve(staking.address, amount);
        await staking.stake(amount, forUser)
        const res = await staking.userInfo(forUser)
        // const expectedReward = calculateReward()

        expect(res.amount).to.eq(beforeAmount.add(amount))
        // expect(res.accumulatedReward).to.eq(beforeAmount.gt(0) ? accPerShareAfterShareUpdate : 0) // imposiible to have reward right after stake
        expect(await staking.amountStaked()).to.eq(beforeAmountStaked.add(amount))
    }

    it("stake", async () => {
        const amount = expandTo18Decimals(256)

        await expect(staking.stake(0, wallet.address)).to.be.revertedWith("Staking: Nothing to deposit")
        await expect(staking.stake(amount, wallet.address)).to.be.revertedWith("ERC20: transfer amount exceeds allowance")

        await staking.togglePause();
        await expect(staking.stake(amount, wallet.address)).to.be.revertedWith("Staking: contract paused.")
        await staking.togglePause();
        await stake(wallet.address, amount)

        await fillUpStaking();

        const amount2 = expandTo18Decimals(150)
        await stake(other.address, amount2)
    })

    async function unstake(user: Wallet, amount: BigNumberish) {
        const amountStakedBefore = await staking.amountStaked()
        const stateBefore = await staking.userInfo(user.address);

        await staking.connect(user).unstake(user.address, amount)

        const state = await staking.userInfo(user.address)
        expect(state.amount).to.eq(stateBefore.amount.sub(amount))
        // expect(state.accumulatedReward).to.eq(stateBefore.accumulatedReward.add(rewardEarn))
        // expect(state.rewardDebt).to.eq(rewardDebt)
        expect(await staking.amountStaked()).to.eq(amountStakedBefore.sub(amount))
    }
    it("unstake", async () => {
        await fillUpStaking();

        const amount = expandTo18Decimals(115)
        await gton.approve(staking.address, amount)

        await staking.stake(amount, wallet.address)

        await expect(staking.unstake(wallet.address, 0)).to.be.revertedWith("Staking: Nothing to unstake")
        await expect(staking.unstake(wallet.address, amount.add(1))).to.be.revertedWith("Staking: Insufficient share")

        await staking.togglePause();
        await expect(staking.unstake(wallet.address, amount)).to.be.revertedWith("Staking: contract paused.")
        await staking.togglePause();

        await gton.transfer(staking.address, await gton.balanceOf(wallet.address));

        await unstake(wallet, amount.sub(15))

    })

    async function harvest(user: Wallet, amount: BigNumberish) {
        await gton.approve(staking.address, amount)
        await staking.stake(amount, user.address)
        const lastTS = (await waffle.provider.getBlock("latest")).timestamp
        await setTimestamp(waffle.provider, lastTS + time.year)
        
        const stateBefore = await staking.userInfo(user.address);
        // const rewardEarn = currentAccRewPerShare.add(updateARPS).mul(stateBefore.amount).div(calcDecimals).sub(stateBefore.rewardDebt);
        // const rewardDebt = currentAccRewPerShare.add(updateARPS).mul(stateBefore.amount).div(calcDecimals);

        // await staking.connect(user).harvest(rewardEarn)
        const stateAfter = await staking.userInfo(user.address)
        expect(stateAfter.harvestTimestamp).to.eq((await waffle.provider.getBlock("latest")).timestamp)
        expect(stateAfter.accumulatedReward).to.eq(0)
        // expect(await gton.balanceOf(user.address)).to.eq(rewardEarn)
    }

    it("harvest", async () => {
        await fillUpStaking();

        const amount = expandTo18Decimals(115)

        await expect(staking.harvest(0)).to.be.revertedWith("Staking: Nothing to harvest")
        await expect(staking.harvest(amount.add(1))).to.be.revertedWith("Staking: Insufficient to harvest")

        await staking.togglePause();
        await expect(staking.harvest(amount)).to.be.revertedWith("Staking: contract paused.")
        await staking.togglePause();

        await gton.transfer(staking.address, amount); // so staking can transfer rewards


        await gton.approve(staking.address, amount)
        await staking.stake(amount, bob.address)

        const lastTS = (await waffle.provider.getBlock("latest")).timestamp
        await setTimestamp(waffle.provider, lastTS+time.month)
        await staking.connect(bob).harvest(1)
        await expect(staking.connect(bob).harvest(1)).to.be.revertedWith("Staking: less than 24 hours since last harvest")

        await harvest(admin0, amount)

    })

    async function transfer(sender: Wallet, receiver: string, amount: BigNumberish) {
        const ARPS = await staking.accumulatedRewardPerShare()

        const senderStateBefore = await staking.userInfo(sender.address)
        const receiverStateBefore = await staking.userInfo(receiver)

        const updSenderAmount = senderStateBefore.amount.sub(amount)
        // const updSenderAcc = updateARPS.mul(senderStateBefore.amount).div(calcDecimals).sub(senderStateBefore.rewardDebt)
        const updReceiverAmount = receiverStateBefore.amount.add(amount)
        // const updReceiverAcc = updateARPS.mul(receiverStateBefore.amount).div(calcDecimals).sub(receiverStateBefore.rewardDebt)

        await staking.connect(sender).transfer(receiver, amount)

        const senderStateAfter = await staking.userInfo(sender.address)
        const receiverStateAfter = await staking.userInfo(receiver)

        expect(senderStateAfter.amount).to.eq(updSenderAmount)
        expect(receiverStateAfter.amount).to.eq(updReceiverAmount)

        // expect(senderStateAfter.accumulatedReward).to.eq(updSenderAcc)
        // expect(receiverStateAfter.accumulatedReward).to.eq(updReceiverAcc)

        // expect(senderStateAfter.rewardDebt).to.eq(updSenderRewardDebt)
        // expect(receiverStateAfter.rewardDebt).to.eq(updReceiverRewardDebt)
    }

    it("transfer", async () => {
        const amount = expandTo18Decimals(279)
        await gton.approve(staking.address, amount);
        await staking.stake(amount, wallet.address)
        await mineBlocks(waffle.provider, 10)
        const balance = await staking.balanceOf(wallet.address)
        await expect(staking.transfer(other.address, balance.add(expandTo18Decimals(100)))).to.be.revertedWith("ERC20: transfer amount exceeds balance")

        // await staking.togglePause();
        // await expect(staking.transfer(other.address, balance)).to.be.revertedWith("Staking: contract paused.")
        // await staking.togglePause();

        // await transfer(wallet, other.address, amount.sub(65))
    })

    it("approve and allowance", async () => {
        const amount = BigNumber.from("10012412401248")
        const secondAmount = BigNumber.from("1000000")
        expect(await staking.allowance(wallet.address, bob.address)).to.eq(0)

        await staking.togglePause();
        await expect(staking.approve(alice.address, amount)).to.be.revertedWith("Staking: contract paused.")
        await staking.togglePause();

        // await expect(staking.approve(wallet.address, 0)).to.be.revertedWith("ERC20: approve to the zero address")
        await staking.approve(alice.address, amount)
        expect(await staking.allowance(wallet.address, alice.address)).to.eq(amount)
        await staking.approve(alice.address, secondAmount)
        expect(await staking.allowance(wallet.address, alice.address)).to.eq(secondAmount)
    })

    it("transferFrom", async () => {
        const amount = expandTo18Decimals(150)
        await gton.approve(staking.address, amount);
        await staking.stake(amount, wallet.address)

        await mineBlocks(waffle.provider, 10)
        await expect(staking.connect(bob).transferFrom(wallet.address, bob.address, 15)).to.be.revertedWith("ERC20: transfer amount exceeds allowance")

        await staking.togglePause();
        await expect(staking.transferFrom(wallet.address, bob.address, 15)).to.be.revertedWith("Staking: contract paused.")
        await staking.togglePause();

        const transferAmount = (await staking.balanceOf(wallet.address)).div(2) // half of the amount
        await staking.approve(bob.address, transferAmount)

        // const ARPS = await staking.accumulatedRewardPerShare()
        // const updateARPS = (await updateDelta()).add(ARPS);

        const senderStateBefore = await staking.userInfo(wallet.address)
        const receiverStateBefore = await staking.userInfo(bob.address)

        const updSenderAmount = senderStateBefore.amount.sub(transferAmount)
        // const updSenderAcc = updateARPS.mul(senderStateBefore.amount).div(calcDecimals).sub(senderStateBefore.rewardDebt)
        // const updSenderRewardDebt = updateARPS.mul(updSenderAmount).div(calcDecimals)
        const updReceiverAmount = receiverStateBefore.amount.add(transferAmount)
        // const updReceiverAcc = updateARPS.mul(receiverStateBefore.amount).div(calcDecimals).sub(receiverStateBefore.rewardDebt)
        // const updReceiverRewardDebt = updateARPS.mul(updReceiverAmount).div(calcDecimals)

        await staking.connect(bob).transferFrom(wallet.address, bob.address, transferAmount)

        const senderStateAfter = await staking.userInfo(wallet.address)
        const receiverStateAfter = await staking.userInfo(bob.address)

        expect(senderStateAfter.amount).to.eq(updSenderAmount)
        expect(receiverStateAfter.amount).to.eq(updReceiverAmount)

    //     expect(senderStateAfter.accumulatedReward).to.eq(updSenderAcc)
    //     expect(receiverStateAfter.accumulatedReward).to.eq(updReceiverAcc)

    //     expect(senderStateAfter.rewardDebt).to.eq(updSenderRewardDebt)
    //     expect(receiverStateAfter.rewardDebt).to.eq(updReceiverRewardDebt)
    })

    context("Apy checking", function () {

        async function checkUserApy(user: Wallet, period: number, rounding: boolean = false) {
            const apr = await staking.aprBasisPoints()
            const aprDenominator = await staking.aprDenominator();
            const userState = await staking.userInfo(user.address);
            const lastTS = BigNumber.from((await waffle.provider.getBlock("latest")).timestamp)
            const stake = userState.amount;
            const yearEarn = stake.mul(apr).div(aprDenominator);
            const earn = yearEarn.mul(period).div(time.year)
            const balanceBefore = await staking.balanceOf(user.address)
            await setTimestamp(waffle.provider, lastTS.add(period).toNumber())
            if(rounding) {
                expect(await staking.balanceOf(user.address)).to.be.closeTo(balanceBefore.add(earn), 100) // because of 1 block
            } else {
                expect(await staking.balanceOf(user.address)).to.eq(balanceBefore.add(earn))
            }
        }

        /*
        it("After year APY of each user should be correct and APY of all sc the same", async () => {
            await fillUpStaking()
            for (const i of updRewardData) {
                await staking.setApr(i.apr)
                await gton.approve(staking.address, i.amount);
                await staking.stake(i.amount, i.user.address)
                await checkUserApy(i.user, time.year)
            }
        })
        */

        it("After n blocks APY of all sc should be correct for these n blocks", async () => {
            await fillUpStaking()
            const periods = [time.year, time.halfYear, time.month]
            for (const period of periods) {
                for (const i of updRewardData) {
                    // await staking.setApr(i.apr)
                    await gton.approve(staking.address, i.amount);
                    await staking.stake(i.amount, i.user.address)
                    await checkUserApy(i.user, period)
                    // need to return back to save funds for future tests
                    await staking.connect(i.user).unstake(wallet.address, i.amount)
                }
            }
        })

        it("for each user we should emulate several stake and unstake actions and calculate APY", async () => {
            await fillUpStaking();
            const fedorAmount = expandTo18Decimals(180)
            await gton.approve(staking.address, fedorAmount)
            await staking.stake(fedorAmount, fedor.address)
            await checkUserApy(fedor, time.halfYear, true)
            
            // await staking.setApr("1500") // balance update here

            await gton.approve(staking.address, fedorAmount)
            await staking.stake(fedorAmount, alice.address)
            await checkUserApy(alice, time.halfYear, true)

            await staking.connect(fedor).transfer(alice.address, fedorAmount.div(2))
            await checkUserApy(alice, time.year, true)
            await checkUserApy(fedor, time.halfYear, true)

        })

        it("if no one farms there should be 0 income at any block after somebody got in, his APY should suite rules", async () => {
            checkUserApy(other, time.year); // 0 stake means that it will be zero stake for user
            const fedorAmount = expandTo18Decimals(180)
            await gton.approve(staking.address, fedorAmount)
            await staking.stake(fedorAmount, alice.address)
        })

        /*
        it("Check rewardDelta with every second update", async () => {
            await fillUpStaking()
            const period = 100; // seconds
            const previousARPS = await staking.accumulatedRewardPerShare();
            let lastTM = (await waffle.provider.getBlock("latest")).timestamp
            await setTimestamp(waffle.provider, lastTM + period - 1); // -1 because of upcoming update reward poll txn
            await staking.updateRewardPool()
            const afterARPS = await staking.accumulatedRewardPerShare()
            const firstAPRS = (afterARPS).sub(previousARPS);
            let i = 0;
            while(i < period) {
                await staking.updateRewardPool();
                i++;
            }
            console.log(firstAPRS.toString());
            
            const secondAPRS = (await staking.accumulatedRewardPerShare()).sub(afterARPS);
            console.log(secondAPRS.toString());
            expect(secondAPRS).to.eq(firstAPRS)
        })
        */
    })
    context("Harvest cases", function () {
        it("harvest all with update", async () => {

        })
    })

})