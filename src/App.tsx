// Copyright (c) RoochNetwork
// SPDX-License-Identifier: Apache-2.0
// Author: Jason Jo

import { LoadingButton } from "@mui/lab";
import { Button, Chip, Divider, Stack, Typography, TextField } from "@mui/material";
import { X } from "@mui/icons-material";
import { Args, Transaction } from "@roochnetwork/rooch-sdk";
import {
  useConnectWallet,
  useCurrentAddress,
  useRoochClient,
  useWalletStore,
  useWallets,
  useCurrentWallet,
} from "@roochnetwork/rooch-sdk-kit";
import { toast, Toaster } from "sonner";
import { useState } from "react";
import "./App.css";
import { shortAddress } from "./utils";
import axios from "axios";

const tipAddress = "0x19be61b2c02fe2670a30013f7cb874b743ef31bde435a9209f339be40982f636";

function App() {
  const wallets = useWallets();
  const currentWallet = useCurrentWallet();
  const currentAddress = useCurrentAddress();
  const connectionStatus = useWalletStore((state) => state.connectionStatus);
  const setWalletDisconnected = useWalletStore(
    (state) => state.setWalletDisconnected
  );
  const { mutateAsync: connectWallet } = useConnectWallet();

  const client = useRoochClient();
  const [tweetId, setTweetId] = useState('');
  const [rgasAmount, setRgasAmount] = useState('');
  const [txnLoading, setTxnLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);

  function sleep(time: number) {
    return new Promise((resolve) => setTimeout(resolve, time));
  }

  return (
    <Stack
      className="font-sans min-w-[1024px]"
      direction="column"
      sx={{
        minHeight: "calc(100vh - 4rem)",
      }}
    >
      <Stack justifyContent="space-between" className="w-full">
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          className="mb-6"
        >
          <img src="./rooch_black_combine.svg" width="120px" alt="" />
          <Typography className="text-2xl font-semibold mt-6 text-left mb-4">
            x
          </Typography>
          <X fontSize="large" />
        </Stack>
        <Stack spacing={1} justifyItems="flex-end">
          <Chip
            label="Rooch Testnet"
            variant="filled"
            className="font-semibold !bg-slate-950 !text-slate-50 min-h-10"
          />
          <Button
            variant="outlined"
            onClick={async () => {
              if (connectionStatus === "connected") {
                setWalletDisconnected();
                return;
              }
              await connectWallet({ wallet: wallets[0] });
            }}
          >
            {connectionStatus === "connected"
              ? shortAddress(currentAddress?.genRoochAddress().toStr(), 8, 6)
              : "Connect Wallet"}
          </Button>
        </Stack>
      </Stack>
      <Typography className="text-4xl font-semibold mt-6 text-left w-full mb-4">
        Tweet Tipping | <span className="text-2xl">Send Rooch Gas Coin to Author</span>
      </Typography>
      <Divider className="w-full" />
      <Stack
        direction="column"
        className="mt-4 font-medium font-serif w-full text-left"
        spacing={2}
        alignItems="flex-start"
      >
        <Stack direction="row" alignItems="center" spacing={2} className="w-full">
          <Typography className="text-xl whitespace-nowrap">Tweet URL:</Typography>
          <TextField
            size="small"
            className="w-full"
            value={tweetId}
            placeholder="https://x.com/RoochNetwork/status/180000000000000000"
            onChange={(e) => {
              setTweetId(e.target.value);
            }}
          />
        </Stack>
        <Stack direction="row" alignItems="center" spacing={2} className="w-full">
          <Typography className="text-xl whitespace-nowrap">RGAS Amount:</Typography>
          <TextField
            size="small"
            className="w-full"
            value={rgasAmount}
            placeholder="0.00000000"
            onChange={(e) => {
              const value = e.target.value;
              if (/^\d*\.?\d*$/.test(value)) {
                setRgasAmount(value);
              }
            }}
          />
        </Stack>
        <LoadingButton
          loading={txnLoading}
          variant="contained"
          sx={{ width: '400px' }}
          disabled={
            !tweetId || !rgasAmount ||
            (() => {
              try {
                const url = new URL(tweetId);
                return url.hostname !== 'x.com';
              } catch {
                return true;
              }
            })() || connectionStatus !== "connected"
          }
          onClick={async () => {
            try {
              setTxnLoading(true);
              const match = tweetId.match(/status\/(\d+)/);
              if (match) {
                const pureTweetId = match[1];
                const res = await axios.post(
                  'http://test-faucet.rooch.network/fetch-tweet',
                  {
                    tweet_id: pureTweetId,
                  },
                  {
                    headers: {
                      'Content-Type': 'application/json',
                    },
                  }
                );
                let tweet_obj_id = res?.data?.ok;
                console.log('tweet_obj_id:', tweet_obj_id);
                if (tweet_obj_id) {
                  const res = await client.getStates({
                    accessPath: `/object/${tweet_obj_id}`,
                    stateOption: {
                      decode: true,
                    },
                  });
                  let author_id = res[0]?.decoded_value?.value.author_id;

                  let retryCount = 0;
                  while (!author_id && retryCount < 20) {
                    await sleep(1200);
                    const retryRes = await client.getStates({
                      accessPath: `/object/${tweet_obj_id}`,
                      stateOption: {
                        decode: true,
                      },
                    });
                    author_id = retryRes[0]?.decoded_value?.value.author_id;
                    retryCount++;
                  }

                  if (author_id) {
                    const txn = new Transaction();
                    txn.callFunction({
                      address: tipAddress,
                      module: "tweet_tip",
                      function: "tip",
                      args: [Args.string(String(author_id)), Args.u256(BigInt(Number(rgasAmount) * 100000000))],
                    });

                    let res = await client.signAndExecuteTransaction({
                      transaction: txn,
                      signer: currentWallet.wallet!,
                    });
                    if (res.execution_info.status.type === 'executed') {
                      toast.success('Tip sent successfully');
                    } else {
                      toast.error(`Tip failed: ${JSON.stringify(res.execution_info.status)}`);
                    }
                  } else {
                    toast.error('Please try again later. The Oracle is loading tweets.');
                  }
                }
              }
            } catch (error) {
              console.error(String(error));
              toast.error(String(error));
            } finally {
              setTxnLoading(false);
            }
          }}
        >
          {"Tip"}
        </LoadingButton>
      </Stack>
      <Toaster expand={true} richColors position="bottom-left" />
      <Stack
        className="mt-12 w-full font-medium "
        direction="column"
        alignItems="flex-start"
      >
        <Typography className="text-4xl font-semibold mt-6 text-left w-full mb-4">
          Claim Tips | <span className="text-2xl">Please bind your Twitter account First</span>
        </Typography>
        <Divider className="w-full" />
        <Stack
          direction="column"
          className="mt-4 font-medium font-serif w-full text-left"
          spacing={2}
          alignItems="flex-start"
        >
          <LoadingButton
            loading={claimLoading}
            variant="contained"
            sx={{ width: '400px', alignSelf: 'flex-start' }}
            disabled={connectionStatus !== "connected"}
            onClick={async () => {
              try {
                setClaimLoading(true);
                const txn = new Transaction();
                txn.callFunction({
                  address: tipAddress,
                  module: "tweet_tip",
                  function: "claim_tip",
                  args: [],
                });
                let res = await client.signAndExecuteTransaction({
                  transaction: txn,
                  signer: currentWallet.wallet!,
                });
                console.log('res:', res);
                if (res.execution_info.status.type === 'executed') {
                  toast.success('Claim tips successfully');
                } else if ((res.execution_info.status as any).abort_code == 3) {
                  toast.error('No tips to claim');
                } else {
                  toast.error(`Claim failed: ${JSON.stringify(res.execution_info.status)}`);
                }
              }
              catch (error) {
                console.error(String(error));
                toast.error(String(error));
              } finally {
                setClaimLoading(false);
              }
            }}
          >
            {"Claim"}
          </LoadingButton>
        </Stack>
      </Stack>
    </Stack>
  );
}

export default App;
