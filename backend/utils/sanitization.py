import bleach

def sanitize_markdown_text(text: str) -> str:
    """
    Sanitize markdown or plain text fields by stripping out dangerous HTML.
    This allows basic HTML that markdown might produce/use, but blocks scripts, iframes, etc.
    """
    if not text:
        return text
    
    # Allow safe tags often used in markdown rendering
    allowed_tags = bleach.ALLOWED_TAGS | {
        'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
        'br', 'hr', 'pre', 'code', 'blockquote',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'span', 'div', 'img'
    }
    
    allowed_attributes = {
        **bleach.ALLOWED_ATTRIBUTES,
        'img': ['src', 'alt', 'title'],
        '*': ['class', 'id']
    }
    
    return bleach.clean(
        text,
        tags=allowed_tags,
        attributes=allowed_attributes,
        strip=True
    )
