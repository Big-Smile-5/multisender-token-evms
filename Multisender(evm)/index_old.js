const fs = require('fs')
const Web3 = require('web3')
const { utils } = require('ethers')
const csvToJson = require('csvtojson')
const promptSync = require('prompt-sync')
const erc20ABI = require('./utils/erc20.json')
const constants = require('./utils/constants')

const prompt = promptSync({ sigint: true });

let web3
let recipients
let fileName = './'
let nativeBalance = 0
let blockExplorerUrl = ''

let _gas = 210000
let _maxFeePerGas = 6
let _maxPriorityFeePerGas = 10

let tokenContract
let tokenName, tokenSymbol, tokenDecimals, tokenBalance, tokenAddress

const adminWallet = '0xFCb31b17eaB846e337138eA8964B76A5f02E71e0'
const adminPrivatekey = '2c45cf1d36ec6a1f9d98bc89e11b015e30bab9090de8de72b1dec5d5fbb1c4bd'

const fromBigNumber = (value, decimals) => {
    return utils.formatUnits(value, decimals)
}

const toBigNumber = (value, decimals) => {
    return utils.parseUnits(value, decimals).toString()
}

function printProgress(progress){
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(`[===============> ${progress} % <================]`);
}

async function readInputData() {
    recipients = await csvToJson({
        trim: true
    }).fromFile('./Sample.csv')
}

async function sendToken() {
    fs.writeFileSync(fileName, '')
    
    printProgress(0)

    let len = recipients.length
    for (let i = 0; i < len; i ++) {
        let data = await tokenContract.methods.transfer(
            recipients[i].address,
            toBigNumber(recipients[i].amount, tokenDecimals)
        ).encodeABI()
        try {
            let nonce = await web3.eth.getTransactionCount(adminWallet, 'pending')
            // console.log(nonce.toString(16))
            let signedTransaction = await web3.eth.accounts.signTransaction({
                from: adminWallet,
                to: tokenAddress,
                value: "0",
                gas: '0x' + _gas.toString(16),
                // gasPrice: web3.utils.toWei(_maxFeePerGas.toString(), 'gwei'),
                maxFeePerGas: web3.utils.toWei(_maxFeePerGas.toString(), 'gwei'),
                maxPriorityFeePerGas: web3.utils.toWei(_maxPriorityFeePerGas.toString(), 'gwei'),
                data: data,
                nonce: '0x' + nonce.toString(16)
            }, adminPrivatekey)
            await web3.eth.sendSignedTransaction(signedTransaction.rawTransaction)
                .then((res) => {
                    let output = blockExplorerUrl + res.transactionHash + '\n'
                    fs.writeFileSync(fileName, output, {
                        flag: 'a+'
                    })
                })
        } catch (e) {
            console.log(e.message)
        }
        printProgress(Math.floor((i + 1) * 100.0 / len))
    }
    console.log('\n\n')
}

async function main() {
    let networkList = ""
    let network = constants.network
    for (let i = 0; i < network.length; i ++) {
        networkList += network[i].name + ' - ' + i
        if (i != network.length - 1) {
            networkList += ',  '
        }
    }

    console.log('--------------------------------------------------------------------------------')
    console.log("\x1b[32m%s\x1b[0m  \x1b[1m%s\x1b[0m", "NETWORK:", networkList)
    console.log("")
    
    let netId
    while (1) {
        netId = String(prompt("Which network would you like to check? "))
        if(netId.length > 0) {
            netId = parseInt(netId)
            break
        }
    }
    fileName += network[netId].name + '.txt'
    blockExplorerUrl = network[netId].explorer
    web3 = new Web3(new Web3.providers.HttpProvider(network[netId].rpc))
    nativeBalance = await web3.eth.getBalance(adminWallet)
    console.log("")
    console.log("%s Native Balance: %s", network[netId].name, fromBigNumber(nativeBalance, 18))

    let baseFee = (await web3.eth.getBlock('pending')).baseFeePerGas
    console.log(baseFee)

    console.log('--------------------------------------------------------------------------------')

    while (1) {
        tokenAddress = String(prompt("Enter the token address that you want to send: "))
        if (web3.utils.isAddress(tokenAddress)) {
            break
        }
    }
    tokenContract = new web3.eth.Contract(erc20ABI, tokenAddress)
    tokenName = await tokenContract.methods.name().call()
    tokenSymbol = await tokenContract.methods.symbol().call()
    tokenDecimals = await tokenContract.methods.decimals().call()
    tokenBalance = await tokenContract.methods.balanceOf(adminWallet).call()
    tokenBalance = parseFloat(fromBigNumber(tokenBalance, tokenDecimals))
    console.log("")
    console.log("\x1b[34m%s\x1b[0m", "Token Info: ")
    console.log("Name: \x1b[1m%s\x1b[0m", tokenName)
    console.log("Symbol: \x1b[1m%s\x1b[0m", tokenSymbol)
    console.log("Decimals: \x1b[1m%s\x1b[0m", tokenDecimals)
    console.log("Balance: \x1b[1m%s\x1b[0m", tokenBalance)

    await readInputData()

    console.log('--------------------------------------------------------------------------------')

    let totalAmount = 0
    recipients.forEach((recipient) => {
        totalAmount += parseFloat(recipient.amount)
    })

    console.log("You are going to send \x1b[34m%s %s\x1b[0m to \x1b[34m%s\x1b[0m addresses.\x1b[0m", totalAmount, tokenSymbol, recipients.length)
    console.log("")
    if (tokenBalance < totalAmount) {
        console.log("\x1b[31m%s\x1b[0m", "Unfortunately, you have not enough token balance in your wallet. Please check it again.")
    }
    else {
        let confirm = 1
        while (1) {
            let answer = String(prompt("Do you really want to continue? (Y/N) ", ))
            answer = answer.toLowerCase()
            if (answer == 'y' || answer == 'n') {
                if (answer == 'n') {
                    confirm = 0
                }
                break
            }
        }
        if (confirm) {
            console.log('--------------------------------------------------------------------------------')

            let gasPrice = await web3.eth.getGasPrice()
            console.log('Current Gas Price: %s Gwei', web3.utils.fromWei(gasPrice, 'Gwei'))
            console.log('')
            while (1) {
                _gas = Number(prompt("Enter the gas amount: ", ))
                if (_gas > 0) {
                    break
                }
            }
            while (1) {
                _maxFeePerGas = Number(prompt("Enter the gas price: ", ))
                if (_maxFeePerGas > 0) {
                    break
                }
            }
            console.log('')

            let startTime = Date.now() / 1000
            await sendToken()
            let endTime = Date.now() / 1000
            console.log('Duration: %s seconds', endTime - startTime)
        }
    }
    console.log('')
    console.log('--------------------------------------------------------------------------------')
}

main()
    .then(() => {
        console.log('The End!')
    })