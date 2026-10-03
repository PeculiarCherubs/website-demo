-- Peculiar Cherubs — Peculiar HQ Canonicalization
-- Mother Church is now Peculiar HQ.
-- Untagged sermons remain unassigned for explicit review.

begin;

update public.site_content sc
set data =
  jsonb_set(
    jsonb_set(
      sc.data,
      '{details,peculiar-hq}',
      coalesce(
        sc.data #> '{details,peculiar-hq}',
        jsonb_build_object(
          'id','peculiar-hq',
          'href','peculiar-hq.html',
          'category','Peculiar HQ',
          'title','Peculiar HQ',
          'shortTitle','Peculiar HQ',
          'summary','The headquarters worship location of Peculiar Cherubs, with its own services, sermons, broadcasts, and church-wide gatherings.',
          'image','assets/hero/mother-church-brand.jpg',
          'facts','[]'::jsonb,
          'overview',jsonb_build_array(
            'Peculiar HQ is the headquarters worship location of Peculiar Cherubs.',
            'HQ-specific services, sermons, livestreams, and updates are presented on this page.'
          ),
          'leaders','[]'::jsonb,
          'functionsTitle','HQ focus',
          'functions',jsonb_build_array(
            'HQ worship services and church-wide gatherings',
            'HQ sermons and livestream broadcasts',
            'Central church announcements and worship updates'
          )
        )
      ),
      true
    ),
    '{current}',
    (
      select jsonb_build_array(
        jsonb_build_object(
          'name','Peculiar HQ',
          'subtitle','The headquarters worship location of Peculiar Cherubs.',
          'status','Peculiar HQ',
          'logo','assets/logos/mother-church.png',
          'href','peculiar-hq.html',
          'id','peculiar-hq'
        )
      ) || coalesce(
        (
          select jsonb_agg(item)
          from jsonb_array_elements(
            case when jsonb_typeof(sc.data -> 'current')='array'
              then sc.data -> 'current' else '[]'::jsonb end
          ) item
          where coalesce(item ->> 'id','') not in ('peculiar-hq','mother-church','general','mother')
        ),
        '[]'::jsonb
      )
    ),
    true
  )
where sc.key='chapels' and jsonb_typeof(sc.data)='object';

update public.site_content
set data=jsonb_set(
  jsonb_set(data,'{hero,eyebrow}','"Worship Locations"'::jsonb,true),
  '{hero,description}',
  '"Peculiar HQ and each PDCM chapel carry the vision of Peculiar Cherubs while serving their worshipping communities."'::jsonb,
  true
)
where key='chapels' and jsonb_typeof(data)='object';

update public.site_content sc
set data=jsonb_set(
  sc.data,
  '{channels}',
  (
    with channels as (
      select key,value
      from jsonb_each(
        case when jsonb_typeof(sc.data -> 'channels')='object'
          then sc.data -> 'channels' else '{}'::jsonb end
      )
    ),
    chosen as (
      select coalesce(
        (select value from channels where key='peculiar-hq' limit 1),
        (select value from channels where key='mother-church' limit 1),
        (select value from channels where key='general' limit 1),
        (select value from channels where key='mother' limit 1),
        '{}'::jsonb
      ) hq
    ),
    retained as (
      select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) obj
      from channels
      where key not in ('peculiar-hq','mother-church','general','mother')
    )
    select retained.obj || jsonb_build_object(
      'peculiar-hq',
      jsonb_set(
        case when jsonb_typeof(chosen.hq)='object' then chosen.hq else '{}'::jsonb end,
        '{label}',
        '"Peculiar HQ"'::jsonb,
        true
      )
    )
    from retained,chosen
  ),
  true
)
where sc.key='livestream' and jsonb_typeof(sc.data)='object';

update public.site_content sc
set data=jsonb_set(
  sc.data,
  '{items}',
  (
    select coalesce(
      jsonb_agg(
        case
          when coalesce(item ->> 'chapelId',item ->> 'chapelKey','') in
            ('mother-church','general','mother','motherchurch','mother_church')
          then (item - 'chapelKey') || jsonb_build_object('chapelId','peculiar-hq')
          else item
        end
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(
      case when jsonb_typeof(sc.data -> 'items')='array'
        then sc.data -> 'items' else '[]'::jsonb end
    ) item
  ),
  true
)
where sc.key='sermons' and jsonb_typeof(sc.data)='object';

commit;
