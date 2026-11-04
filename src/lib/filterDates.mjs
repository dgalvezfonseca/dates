export function filterDates(dates, { query, category, energy, setting, duration }) {
  const search = query.toLocaleLowerCase('es')
  return dates.filter((date) => {
    const matchesDuration = duration === 'todas' || (duration === 'corta' ? date.duration_minutes <= 60 : duration === 'media' ? date.duration_minutes > 60 && date.duration_minutes <= 120 : date.duration_minutes > 120)
    return (category === 'todas' || date.category === category)
      && (energy === 'todas' || date.energy === energy)
      && (setting === 'todas' || date.setting === setting)
      && matchesDuration
      && `${date.title} ${date.description}`.toLocaleLowerCase('es').includes(search)
  })
}
