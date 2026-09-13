import os
import requests

GROQ_MODEL = "openai/gpt-oss-20b"  # Groq's free tier as of this build — Llama 3.3 70B has
                                    # moved to an enterprise-only tier; check
                                    # console.groq.com/docs/models if this drifts before your event


def draft_report(run_summary: str) -> str:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        print("[compliance] GROQ_API_KEY not set — using raw summary.")
        return run_summary
    from groq import Groq
    client = Groq(api_key=api_key)
    resp = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content":
                   f"Write a 3-sentence plain-English safety report for this robot test run: {run_summary}"}],
    )
    return resp.choices[0].message.content


def post_to_slack(text: str) -> None:
    webhook = os.environ.get("SLACK_WEBHOOK_URL")
    if not webhook:
        print(f"[compliance] SLACK_WEBHOOK_URL not set — would have posted:\n{text}")
        return
    resp = requests.post(webhook, json={"text": f":shield: Aegis Safety Report\n{text}"}, timeout=10)
    resp.raise_for_status()


def escalate(run_summary: str) -> str:
    report = draft_report(run_summary)
    post_to_slack(report)
    return report
