"use client"

import { useEffect, useMemo, useState } from "react"
import { Coins, Layers, TrendingUp, Vote } from "lucide-react"
import { CampaignCard } from "@/components/campaign-card"
import { CreateCampaignModal, type NewCampaignInput } from "@/components/create-campaign-modal"
import { getCampaignState, type Campaign, type Proposal, type ProposalStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useAccount, usePublicClient, useWriteContract } from "wagmi"
import { sepolia } from "wagmi/chains"
import { useQuery } from "@tanstack/react-query"
import { crowdfundingABI, contractAddress } from "@/constants/contract"
import { formatEther, parseEther } from "viem"
import { useWallet } from "@/lib/use-wallet"

type Filter = "all" | "active" | "funded" | "failed"

function safeParseEther(value: string | number | undefined): bigint {
  if (value === undefined || value === null) return 0n
  let valStr = typeof value === "number" ? value.toFixed(18) : value.toString().trim()
  if (typeof value === "number") {
    valStr = valStr.replace(/\.?0+$/, "")
  }
  if (valStr === "" || isNaN(Number(valStr))) return 0n
  try {
    return parseEther(valStr)
  } catch (e) {
    return 0n
  }
}

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "funded", label: "Funded" },
  { id: "failed", label: "Failed" },
]

export function Dashboard() {
  const { address } = useWallet()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending: isWritePending } = useWriteContract()
  const [filter, setFilter] = useState<Filter>("all")
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null)

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  // Fetch campaign data from the smart contract
  const { data: campaigns = [], isLoading, refetch } = useQuery<Campaign[]>({
    queryKey: ["campaigns", address, !!publicClient],
    queryFn: async () => {
      if (!publicClient) return []

      try {
        const nextCampaignId = (await publicClient.readContract({
          address: contractAddress,
          abi: crowdfundingABI,
          functionName: "nextCampaignId",
        })) as bigint

        const campaignsList: Campaign[] = []
        const count = Number(nextCampaignId)

        for (let id = 0; id < count; id++) {
          try {
            const campaignData = (await publicClient.readContract({
              address: contractAddress,
              abi: crowdfundingABI,
              functionName: "getCampaign",
              args: [BigInt(id)],
            })) as any

            const isArray = Array.isArray(campaignData)
            const creator = isArray ? campaignData[0] : (campaignData.creator ?? campaignData[0])
            const title = isArray ? campaignData[1] : (campaignData.title ?? campaignData[1] ?? `Campaign #${id}`)
            const description = isArray ? campaignData[2] : (campaignData.description ?? campaignData[2] ?? "")
            const goalWei = isArray ? campaignData[3] : (campaignData.goal ?? campaignData[3] ?? 0n)
            const deadlineSec = isArray ? campaignData[4] : (campaignData.deadline ?? campaignData[4] ?? 0n)
            const raisedWei = isArray ? campaignData[5] : (campaignData.raised ?? campaignData[5] ?? 0n)
            const releasedWei = isArray ? campaignData[6] : (campaignData.releasedAmount ?? campaignData[6] ?? 0n)
            const proposalCountVal = isArray ? campaignData[8] : (campaignData.proposalCount ?? campaignData[8] ?? 0n)
            const exists = isArray ? campaignData[9] : (campaignData.exists ?? campaignData[9] ?? false)

            if (!exists) {
              continue
            }

            const goal = Number(formatEther(goalWei))
            const raised = Number(formatEther(raisedWei))
            const released = Number(formatEther(releasedWei))
            const deadline = Number(deadlineSec) * 1000
            const proposalCount = Number(proposalCountVal)

            // User's contribution
            let myContribution = 0
            if (address) {
              try {
                const contributionWei = (await publicClient.readContract({
                  address: contractAddress,
                  abi: crowdfundingABI,
                  functionName: "contributions",
                  args: [BigInt(id), address],
                })) as bigint
                myContribution = Number(formatEther(contributionWei))
              } catch (e) {
                console.error(`Error contributions for campaign ${id}`, e)
              }
            }

            // Proposals
            const proposals: Proposal[] = []
            for (let pid = 0; pid < proposalCount; pid++) {
              try {
                const proposalData = (await publicClient.readContract({
                  address: contractAddress,
                  abi: crowdfundingABI,
                  functionName: "getProposal",
                  args: [BigInt(id), BigInt(pid)],
                })) as any

                let hasVoted = false
                if (address) {
                  try {
                    hasVoted = (await publicClient.readContract({
                      address: contractAddress,
                      abi: crowdfundingABI,
                      functionName: "hasVoted",
                      args: [BigInt(id), BigInt(pid), address],
                    })) as boolean
                  } catch (e) {
                    console.error("Error checking hasVoted", e)
                  }
                }

                const pIsArray = Array.isArray(proposalData)
                const pDesc = pIsArray ? proposalData[0] : (proposalData.description ?? proposalData[0] ?? "")
                const pAmountWei = pIsArray ? proposalData[1] : (proposalData.amount ?? proposalData[1] ?? 0n)
                const pVotingDeadlineSec = pIsArray ? proposalData[2] : (proposalData.votingDeadline ?? proposalData[2] ?? 0n)
                const pVotesForWei = pIsArray ? proposalData[3] : (proposalData.votesFor ?? proposalData[3] ?? 0n)
                const pVotesAgainstWei = pIsArray ? proposalData[4] : (proposalData.votesAgainst ?? proposalData[4] ?? 0n)
                const pExecuted = pIsArray ? proposalData[5] : (proposalData.executed ?? proposalData[5] ?? false)

                const pAmount = formatEther(pAmountWei)
                const yesWeight = Number(formatEther(pVotesForWei))
                const noWeight = Number(formatEther(pVotesAgainstWei))
                const votingEndsAt = Number(pVotingDeadlineSec) * 1000

                let status: ProposalStatus = "Active"
                if (pExecuted) {
                  status = "Executed"
                } else if (Date.now() >= votingEndsAt) {
                  const majorityFor = pVotesForWei > pVotesAgainstWei
                  const thresholdMet = pVotesForWei * 10000n > goalWei * 5000n // Compare yes weight strictly greater than 50% of campaign goal or raised?
                  // Wait, contract check is: proposal.votesFor * BPS_DENOMINATOR > campaign.raised * APPROVAL_THRESHOLD_BPS;
                  // campaign.raised is raisedWei!
                  const contractThresholdMet = pVotesForWei * 10000n > raisedWei * 5000n
                  if (majorityFor && contractThresholdMet) {
                    status = "Passed"
                  } else {
                    status = "Rejected"
                  }
                }

                proposals.push({
                  id: pid,
                  campaignId: id,
                  reason: pDesc,
                  recipient: creator,
                  amount: pAmount,
                  yesWeight,
                  noWeight,
                  votingEndsAt,
                  status,
                  hasVoted,
                })
              } catch (e) {
                console.error(`Error fetching proposal ${pid}`, e)
              }
            }

            campaignsList.push({
              id,
              title,
              description,
              creator,
              goal,
              raised,
              released,
              deadline,
              myContribution,
              proposals,
            })
          } catch (e) {
            console.error(`Error fetching campaign details for ${id}`, e)
          }
        }

        return campaignsList.sort((a, b) => b.id - a.id)
      } catch (e) {
        console.error("Error listing campaigns:", e)
        return []
      }
    },
    enabled: !!publicClient,
  })

  const stats = useMemo(() => {
    const totalRaised = campaigns.reduce((sum, c) => sum + c.raised, 0)
    const proposals = campaigns.reduce((sum, c) => sum + c.proposals.length, 0)
    const active = campaigns.filter((c) => getCampaignState(c) === "active").length
    return { totalRaised, proposals, active, total: campaigns.length }
  }, [campaigns])

  const visible = useMemo(
    () =>
      filter === "all"
        ? campaigns
        : campaigns.filter((c) => getCampaignState(c) === filter),
    [campaigns, filter],
  )

  // --- Contract actions ---

  async function handleCreate(input: NewCampaignInput) {
    try {
      setNotification({ message: "Confirming campaign creation in wallet...", type: "info" })
      const goalWei = safeParseEther(input.goal)
      const durationSeconds = BigInt(Math.floor(Number(input.durationDays || 0) * 24 * 60 * 60))

      const tx = await writeContractAsync({
        address: contractAddress,
        abi: crowdfundingABI,
        functionName: "createCampaign",
        args: [goalWei, durationSeconds, input.title, input.description],
        chainId: sepolia.id,
      })

      setNotification({ message: "Transaction submitted. Waiting for confirmation...", type: "info" })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: tx })
      }
      setNotification({ message: "Campaign successfully launched on-chain!", type: "success" })
      refetch()
    } catch (e: any) {
      console.error(e)
      setNotification({ message: e.message || "Failed to launch campaign", type: "error" })
    }
  }

  async function handleContribute(campaignId: number, amount: number) {
    try {
      setNotification({ message: "Confirming contribution in wallet...", type: "info" })
      const valWei = safeParseEther(amount)
      const tx = await writeContractAsync({
        address: contractAddress,
        abi: crowdfundingABI,
        functionName: "contribute",
        args: [BigInt(campaignId)],
        value: valWei,
        chainId: sepolia.id,
      })

      setNotification({ message: "Transaction submitted. Waiting for confirmation...", type: "info" })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: tx })
      }
      setNotification({ message: `Successfully contributed ${amount} ETH!`, type: "success" })
      refetch()
    } catch (e: any) {
      console.error(e)
      setNotification({ message: e.message || "Failed to submit contribution", type: "error" })
    }
  }

  async function handleCreateProposal(campaignId: number, amount: number, description: string, durationSecs: number) {
    try {
      setNotification({ message: "Confirming proposal creation in wallet...", type: "info" })
      const amountWei = safeParseEther(amount)

      const tx = await writeContractAsync({
        address: contractAddress,
        abi: crowdfundingABI,
        functionName: "createProposal",
        args: [BigInt(campaignId), amountWei, description, BigInt(Math.floor(durationSecs))],
        chainId: sepolia.id,
      })

      setNotification({ message: "Transaction submitted. Waiting for confirmation...", type: "info" })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: tx })
      }
      setNotification({ message: "Spending proposal successfully created!", type: "success" })
      refetch()
    } catch (e: any) {
      console.error(e)
      setNotification({ message: e.message || "Failed to create proposal", type: "error" })
    }
  }

  async function handleVote(campaignId: number, proposalId: number, support: boolean) {
    try {
      setNotification({ message: "Confirming vote in wallet...", type: "info" })
      const tx = await writeContractAsync({
        address: contractAddress,
        abi: crowdfundingABI,
        functionName: "vote",
        args: [BigInt(campaignId), BigInt(proposalId), support],
        chainId: sepolia.id,
      })

      setNotification({ message: "Transaction submitted. Waiting for confirmation...", type: "info" })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: tx })
      }
      setNotification({ message: "Vote successfully cast on-chain!", type: "success" })
      refetch()
    } catch (e: any) {
      console.error(e)
      setNotification({ message: e.message || "Failed to record vote", type: "error" })
    }
  }

  async function handleExecute(campaignId: number, proposalId: number) {
    try {
      setNotification({ message: "Confirming execution in wallet...", type: "info" })
      const tx = await writeContractAsync({
        address: contractAddress,
        abi: crowdfundingABI,
        functionName: "releaseFunds",
        args: [BigInt(campaignId), BigInt(proposalId)],
        chainId: sepolia.id,
      })

      setNotification({ message: "Transaction submitted. Waiting for confirmation...", type: "info" })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: tx })
      }
      setNotification({ message: "Funds successfully released to the campaign creator!", type: "success" })
      refetch()
    } catch (e: any) {
      console.error(e)
      setNotification({ message: e.message || "Execution failed", type: "error" })
    }
  }

  async function handleRefund(campaignId: number) {
    try {
      setNotification({ message: "Confirming refund claim in wallet...", type: "info" })
      const tx = await writeContractAsync({
        address: contractAddress,
        abi: crowdfundingABI,
        functionName: "claimRefund",
        args: [BigInt(campaignId)],
        chainId: sepolia.id,
      })

      setNotification({ message: "Transaction submitted. Waiting for confirmation...", type: "info" })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: tx })
      }
      setNotification({ message: "Refund successfully claimed and returned!", type: "success" })
      refetch()
    } catch (e: any) {
      console.error(e)
      setNotification({ message: e.message || "Failed to claim refund", type: "error" })
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {notification && (
        <div className={cn(
          "fixed top-4 right-4 z-50 flex items-center gap-2.5 rounded-xl border p-4 shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-top-4",
          notification.type === "success" && "border-success/30 bg-success/15 text-success",
          notification.type === "error" && "border-destructive/30 bg-destructive/15 text-destructive",
          notification.type === "info" && "border-primary/30 bg-primary/15 text-primary"
        )}>
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Crowdfunding, governed by backers
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground text-pretty">
            Back campaigns with ETH. Once funded, every spend is decided on-chain by
            contribution-weighted proposals.
          </p>
        </div>
        <CreateCampaignModal onCreate={handleCreate} isPending={isWritePending} />
      </div>

      {isLoading ? (
        <p className="mt-16 text-center text-sm text-muted-foreground">
          Loading campaigns and on-chain governance records...
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Coins} label="Total Raised" value={`${stats.totalRaised.toFixed(2)} ETH`} />
            <StatCard icon={Layers} label="Campaigns" value={stats.total.toString()} />
            <StatCard icon={TrendingUp} label="Active" value={stats.active.toString()} />
            <StatCard icon={Vote} label="Proposals" value={stats.proposals.toString()} />
          </div>

          <div className="mt-8 flex items-center gap-1.5">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  filter === f.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            {visible.map((c) => (
              <CampaignCard
                key={c.id}
                campaign={c}
                onContribute={handleContribute}
                onCreateProposal={handleCreateProposal}
                onVote={handleVote}
                onExecute={handleExecute}
                onRefund={handleRefund}
              />
            ))}
          </div>

          {visible.length === 0 && (
            <p className="mt-16 text-center text-sm text-muted-foreground">
              No campaigns in this category yet.
            </p>
          )}
        </>
      )}
    </main>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}
