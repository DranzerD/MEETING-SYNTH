from aura_core.preprocessing import clean_text, extract_names, sentence_split


def test_clean_text_normalizes_smart_quotes():
  assert clean_text("“Hello”") == '"Hello"'


def test_clean_text_collapses_whitespace():
  assert clean_text("a   b\n\nc") == "a b c"


def test_sentence_split_on_real_punctuation():
  sentences = sentence_split("We shipped Friday. It went well!")
  assert sentences == ["We shipped Friday.", "It went well!"]


def test_extract_names_finds_real_capitalized_names():
  assert extract_names("Dana will talk to Leo tomorrow") == ["Dana", "Leo"]


def test_extract_names_filters_sentence_initial_pronouns_and_articles():
  """Regression test: 'We should ship Friday.' used to extract 'We' as a
  candidate name/assignee purely because it's capitalized at the start of
  the sentence, not because it's an actual name -- which meant task
  assignee detection (tasks.py's _detect_assignee) and decision
  participant detection (decisions.py) would misreport 'We' or 'The' as
  the responsible person instead of falling through to 'Team' or
  'Not specified'."""
  assert extract_names("We should ship Friday with Dana's help") == ["Friday", "Dana"]
  assert extract_names("The team will review this") == []


def test_extract_names_empty_for_no_capitals():
  assert extract_names("nothing capitalized here") == []
