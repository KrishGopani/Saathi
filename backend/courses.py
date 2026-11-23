"""Content-based Coursera course recommender (TF-IDF + cosine similarity)."""

from functools import lru_cache
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel

DATA_FILE = Path(__file__).resolve().parent / "data" / "coursera.csv"


class CourseIndex:
    def __init__(self):
        df = pd.read_csv(DATA_FILE, encoding="utf-8", encoding_errors="replace")
        df = df.drop_duplicates(subset="Course URL").reset_index(drop=True)
        self.df = df
        # Weight the title and skills more heavily than the long description.
        text = (
            (df["Course Name"] + " ") * 3
            + (df["Skills"].fillna("") + " ") * 2
            + df["Course Description"].fillna("")
        )
        self.vectorizer = TfidfVectorizer(stop_words="english", sublinear_tf=True, min_df=2)
        self.matrix = self.vectorizer.fit_transform(text)

    def _format(self, idx, score):
        row = self.df.iloc[idx]
        return {
            "name": row["Course Name"],
            "university": row["University"],
            "level": row["Difficulty Level"],
            "rating": str(row["Course Rating"]),
            "url": row["Course URL"],
            "score": round(float(score), 4),
        }

    def search(self, query, n=6, interests=None):
        """Rank courses against a keyword query, nudged by the user's interests."""
        if not query or not query.strip():
            return []
        scores = linear_kernel(self.vectorizer.transform([query]), self.matrix).ravel()
        if interests:
            scores = scores + 0.3 * linear_kernel(
                self.vectorizer.transform([" ".join(interests)]), self.matrix
            ).ravel()
        top = scores.argsort()[::-1][:n]
        return [self._format(i, scores[i]) for i in top if scores[i] > 0]

    def similar(self, name, n=6):
        """Courses most similar to a named course (the original Streamlit feature)."""
        matches = self.df.index[self.df["Course Name"] == name]
        if len(matches) == 0:
            return []
        idx = matches[0]
        scores = linear_kernel(self.matrix[idx], self.matrix).ravel()
        top = [i for i in scores.argsort()[::-1] if i != idx][:n]
        return [self._format(i, scores[i]) for i in top]

    def names(self):
        return sorted(self.df["Course Name"].unique())


@lru_cache(maxsize=1)
def get_index():
    return CourseIndex()
