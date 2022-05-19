export let config = {
  "name": "juiceboxDAO",
  "guildId": "775859454780244028",
  "channelId": "873248745771372584",
  "alertRole": "953865172764729404",
  "poll": {
    "voteYesEmoji": "👍",
    "voteNoEmoji": "👎",
    "voteGoVoteEmoji": "🗳",
    "voteCanceledEmoji": "❌", 
    "minYesVotes": 10,
    "yesNoRatio": 0.3
  },
  "snapshot": {
    "base": "https://snapshot.org/#",
    "space": "jbdao.eth",
    "choices": ['For', 'Against', 'Abstain'],
    "votingTimeDays": 4,
    "quroum": 15,
    "passingRatio": 0.66
  },
  "notionPublicUrlPrefix": "juicebox.notion.site",
  "proposalIdPrefix": "JBP-",
  "ipfsGateway": "https://gateway.pinata.cloud/ipfs",
  "proposalIdProperty": "Juicebox Proposal ID",
  "governanceScheduleDb": {
    "location": "notion",
    "id": "f667423e111d4c07b6703921f1ae1f3e",
    "filter": {
      "property": "Date",
      "date": {
        "next_week": {}
      }
    },
    "sorts":
    [
      {
        "property": "Date",
        "direction": "ascending"
      }
    ]
  },
  "proposalDb": {
    "location": "notion",
    "id": "9d126f9148dc42ee83317d5cd74e4db4",
    "preDiscussionFilter": {
      "and" : [
      {
        "property": "Status",
        "select": {
          "equals":"Discussion"
        }
      },
      {
        "property": "Discussion Thread",
        "url": {
          "is_empty": true
        }
      },
      {
        "property": "Name",
        "title": {
          "is_not_empty": true
        }
      }]
    },
    "discussionFilter": {
      "and" : [
      {
        "property": "Status",
        "select": {
          "equals":"Discussion"
        }
      },
      {
        "property": "Discussion Thread",
        "url": {
          "is_not_empty": true
        }
      }]
    },
    "proposalIdFilter": {
      "property": null,
      "rich_text": {
        "contains": "JBP-"
      }
    },
    "temperatureCheckFilter": {
      "property": "Status",
      "select": {
        "equals":"Temperature Check"
      }
    },
    "votingFilter": {
      "and" : [
      {
        "property": "Status",
        "select": {
          "equals": "Voting"
        }
      },
      {
        "property": "Snapshot",
        "url": {
          "is_not_empty": true
        }
      }]
    }
  }
}