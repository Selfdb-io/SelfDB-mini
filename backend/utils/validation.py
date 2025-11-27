# utils/validation.py
"""Shared validation utilities for API endpoints."""

import re
from fastapi import HTTPException, status

# Search term pattern: only allow printable ASCII characters (letters, numbers, spaces, common punctuation)
# This prevents null bytes, control characters, and other problematic characters
SEARCH_TERM_PATTERN = re.compile(r'^[\x20-\x7E]*$')

# Export the pattern string for use in Query annotations
SEARCH_TERM_REGEX = r'^[\x20-\x7E]*$'


def validate_search_term(search: str | None) -> str | None:
    """
    Validate search term contains only safe printable ASCII characters.
    Rejects null bytes, control characters, and non-ASCII characters that can cause DB errors.
    
    Args:
        search: The search term to validate, or None
        
    Returns:
        The validated search term, or None
        
    Raises:
        HTTPException: 400 Bad Request if the search term contains invalid characters
    """
    if search is None:
        return None
    
    if not SEARCH_TERM_PATTERN.match(search):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search term contains invalid characters. Only printable ASCII characters are allowed."
        )
    
    return search
